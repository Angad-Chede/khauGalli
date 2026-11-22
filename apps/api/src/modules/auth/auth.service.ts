import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db, users, refreshTokens, restaurantStaff, restaurants } from '@tiffin/db';
import { generateUuidV7, DEMO_PERSONAS, UserRole } from '@tiffin/shared';
import { eq, and, isNull } from 'drizzle-orm';
import { redis } from '../../lib/redis';
import { OtpProvider, defaultOtpProvider } from './otp-provider';

const DEMO_PHONES = Object.values(DEMO_PERSONAS).map((p) => p.phone);

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    phone: string;
    name: string | null;
    email: string | null;
    roles: string[];
    isDemo: boolean;
  };
  activeRole: UserRole;
  restaurantId?: string;
}

export class AuthService {
  private otpProvider: OtpProvider;
  private jwtSecret: string;
  private allowDemoBypass: boolean;
  private isProduction: boolean;

  constructor(provider: OtpProvider = defaultOtpProvider) {
    this.otpProvider = provider;
    this.jwtSecret = process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production_super_safe_key_123456';
    this.isProduction = process.env.NODE_ENV === 'production';
    this.allowDemoBypass = process.env.ALLOW_DEMO_BYPASS_OTP === 'true';

    // Hard boot gate
    if (this.isProduction && this.allowDemoBypass) {
      throw new Error('FATAL SECURITY VIOLATION: ALLOW_DEMO_BYPASS_OTP cannot be true in production.');
    }
  }

  private hashSecret(value: string): string {
    const hmacSecret = this.jwtSecret || 'tiffin_default_hmac_secret_key';
    return crypto.createHmac('sha256', hmacSecret).update(value).digest('hex');
  }

  /**
   * Request a 6-digit OTP for the given phone number with rate limiting and demo bypass guardrails.
   */
  async requestOtp(phone: string): Promise<{ success: boolean; isDemo: boolean; message: string }> {
    const normalizedPhone = phone.trim();

    // 1. Rate limiting: max 3 requests per 10 minutes (600s)
    const rateLimitKey = `rate:otp:${normalizedPhone}`;
    const attempts = await redis.incr(rateLimitKey);
    if (attempts === 1) {
      await redis.expire(rateLimitKey, 600);
    }
    if (attempts > 3) {
      throw new Error('Rate limit exceeded. Maximum 3 OTP requests allowed per 10 minutes.');
    }

    // 2. Demo bypass check: ONLY for the 4 seeded demo phones, ONLY in non-production, ONLY if flag is true
    const isDemo = DEMO_PHONES.includes(normalizedPhone);
    let code: string;

    if (isDemo && !this.isProduction && this.allowDemoBypass) {
      code = '123456';
    } else {
      code = crypto.randomInt(100000, 999999).toString();
    }

    // 3. Store SHA-256 hash in Redis with 5-minute TTL (300s)
    const otpKey = `otp:${normalizedPhone}`;
    const hashedCode = this.hashSecret(`${normalizedPhone}:${code}`);
    await redis.set(otpKey, hashedCode, 'EX', 300);

    // 4. Dispatch via provider
    await this.otpProvider.sendOtp(normalizedPhone, code);

    return {
      success: true,
      isDemo,
      message: 'OTP dispatched successfully. Valid for 5 minutes.',
    };
  }

  /**
   * Verify OTP and issue JWT access token and rotated refresh token.
   */
  async verifyOtp(phone: string, code: string): Promise<AuthSession> {
    const normalizedPhone = phone.trim();
    const otpKey = `otp:${normalizedPhone}`;
    const storedHash = await redis.get(otpKey);

    if (!storedHash) {
      throw new Error('Invalid or expired OTP. Please request a new code.');
    }

    const incomingHash = this.hashSecret(`${normalizedPhone}:${code.trim()}`);
    if (incomingHash !== storedHash) {
      throw new Error('Invalid OTP code. Please check and try again.');
    }

    // Single-use guarantee: delete immediately upon verification
    await redis.del(otpKey);

    // Find or create user
    let userRecord = await db.query.users.findFirst({
      where: eq(users.phone, normalizedPhone),
    });

    const isDemo = DEMO_PHONES.includes(normalizedPhone);

    if (!userRecord) {
      const newUserId = generateUuidV7();
      // Match demo persona roles if applicable
      const matchedPersona = Object.values(DEMO_PERSONAS).find((p) => p.phone === normalizedPhone);
      const assignedRoles: string[] = matchedPersona ? [matchedPersona.role] : ['CUSTOMER'];

      await db.insert(users).values({
        id: newUserId,
        phone: normalizedPhone,
        name: matchedPersona ? matchedPersona.name : null,
        roles: assignedRoles,
        isDemo,
      });

      userRecord = await db.query.users.findFirst({
        where: eq(users.id, newUserId),
      });
    }

    if (!userRecord) {
      throw new Error('Failed to retrieve or create user record.');
    }

    // Check staff association for restaurants
    let restaurantId: string | undefined;
    const staffRecord = await db.query.restaurantStaff.findFirst({
      where: eq(restaurantStaff.userId, userRecord.id),
    });
    if (staffRecord) {
      restaurantId = staffRecord.restaurantId;
    }

    const primaryRole = (userRecord.roles[0] || 'CUSTOMER') as UserRole;

    // Issue Access Token (15m expiry)
    const accessToken = jwt.sign(
      {
        sub: userRecord.id,
        phone: userRecord.phone,
        roles: userRecord.roles,
        activeRole: primaryRole,
        restaurantId,
        isDemo: userRecord.isDemo,
      },
      this.jwtSecret,
      { expiresIn: '15m' }
    );

    // Issue Refresh Token (30 days expiry, hashed and stored in DB)
    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const refreshHash = this.hashSecret(rawRefreshToken);
    const refreshTokenId = generateUuidV7();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db.insert(refreshTokens).values({
      id: refreshTokenId,
      userId: userRecord.id,
      tokenHash: refreshHash,
      expiresAt,
    });

    return {
      accessToken,
      refreshToken: `${refreshTokenId}.${rawRefreshToken}`,
      user: {
        id: userRecord.id,
        phone: userRecord.phone,
        name: userRecord.name,
        email: userRecord.email,
        roles: userRecord.roles,
        isDemo: userRecord.isDemo,
      },
      activeRole: primaryRole,
      restaurantId,
    };
  }

  /**
   * Rotate refresh token and issue a fresh access token.
   */
  async refreshSession(combinedRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const [tokenId, rawSecret] = combinedRefreshToken.split('.');
    if (!tokenId || !rawSecret) {
      throw new Error('Malformed refresh token.');
    }

    const incomingHash = this.hashSecret(rawSecret);
    const existingToken = await db.query.refreshTokens.findFirst({
      where: and(
        eq(refreshTokens.id, tokenId),
        eq(refreshTokens.tokenHash, incomingHash),
        isNull(refreshTokens.revokedAt)
      ),
    });

    if (!existingToken) {
      throw new Error('Invalid or revoked refresh token.');
    }

    if (existingToken.expiresAt < new Date()) {
      throw new Error('Refresh token has expired. Please log in again.');
    }

    const userRecord = await db.query.users.findFirst({
      where: eq(users.id, existingToken.userId),
    });

    if (!userRecord) {
      throw new Error('User not found.');
    }

    let restaurantId: string | undefined;
    const staffRecord = await db.query.restaurantStaff.findFirst({
      where: eq(restaurantStaff.userId, userRecord.id),
    });
    if (staffRecord) {
      restaurantId = staffRecord.restaurantId;
    }

    const primaryRole = (userRecord.roles[0] || 'CUSTOMER') as UserRole;

    // Issue fresh access token
    const accessToken = jwt.sign(
      {
        sub: userRecord.id,
        phone: userRecord.phone,
        roles: userRecord.roles,
        activeRole: primaryRole,
        restaurantId,
        isDemo: userRecord.isDemo,
      },
      this.jwtSecret,
      { expiresIn: '15m' }
    );

    // Rotate refresh token: create new token and revoke previous token
    const newRawRefreshToken = crypto.randomBytes(32).toString('hex');
    const newRefreshHash = this.hashSecret(newRawRefreshToken);
    const newRefreshTokenId = generateUuidV7();
    const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db.insert(refreshTokens).values({
      id: newRefreshTokenId,
      userId: userRecord.id,
      tokenHash: newRefreshHash,
      expiresAt: newExpiresAt,
    });

    await db
      .update(refreshTokens)
      .set({
        revokedAt: new Date(),
        replacedByTokenId: newRefreshTokenId,
      })
      .where(eq(refreshTokens.id, existingToken.id));

    return {
      accessToken,
      refreshToken: `${newRefreshTokenId}.${newRawRefreshToken}`,
    };
  }

  /**
   * Revoke an active refresh token on logout.
   */
  async logout(combinedRefreshToken: string): Promise<void> {
    const [tokenId] = combinedRefreshToken.split('.');
    if (!tokenId) return;

    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, tokenId));
  }
}

export const authService = new AuthService();
