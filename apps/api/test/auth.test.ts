import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from '../src/modules/auth/auth.service';
import { validateEnv } from '@tiffin/shared';

describe('AuthService & Guardrails', () => {
  let authService: AuthService;

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DEMO_BYPASS_OTP = 'true';
    process.env.JWT_SECRET = 'test_secret_must_be_32_characters_long_min_1234';
    authService = new AuthService();
  });

  it('rejects boot in production when ALLOW_DEMO_BYPASS_OTP is true', () => {
    expect(() => {
      validateEnv({
        NODE_ENV: 'production',
        ALLOW_DEMO_BYPASS_OTP: 'true',
        DATABASE_URL: 'postgresql://postgres:password@localhost:5432/tiffin_db',
        JWT_SECRET: 'super_secure_production_secret_key_32_chars_long',
      });
    }).toThrow(/FATAL SECURITY VIOLATION/);
  });

  it('permits boot in production when ALLOW_DEMO_BYPASS_OTP is false', () => {
    const env = validateEnv({
      NODE_ENV: 'production',
      ALLOW_DEMO_BYPASS_OTP: 'false',
      DATABASE_URL: 'postgresql://postgres:password@localhost:5432/tiffin_db',
      JWT_SECRET: 'super_secure_production_secret_key_32_chars_long',
      RAZORPAY_KEY_ID: 'rzp_live_real_prod_key_123',
      RAZORPAY_KEY_SECRET: 'real_prod_secret_456',
    });
    expect(env.NODE_ENV).toBe('production');
    expect(env.ALLOW_DEMO_BYPASS_OTP).toBe('false');
  });

  it('generates demo OTP (123456) for seeded demo phone numbers in dev mode', async () => {
    const demoPhone = '+919999900001'; // Asha
    const result = await authService.requestOtp(demoPhone);

    expect(result.success).toBe(true);
    expect(result.isDemo).toBe(true);
  });

  it('enforces rate limiting of maximum 3 OTP requests within window', async () => {
    const testPhone = '+919999999999';

    // 1st, 2nd, 3rd requests succeed
    await authService.requestOtp(testPhone);
    await authService.requestOtp(testPhone);
    await authService.requestOtp(testPhone);

    // 4th request must be rejected
    await expect(authService.requestOtp(testPhone)).rejects.toThrow(/Rate limit exceeded/);
  });
});
