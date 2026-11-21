import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { authService } from './auth.service';
import { db, users, restaurantStaff, restaurants } from '@tiffin/db';
import { eq } from 'drizzle-orm';

const RequestOtpSchema = z.object({
  phone: z.string().min(10, 'Valid phone number required'),
});

const VerifyOtpSchema = z.object({
  phone: z.string().min(10, 'Valid phone number required'),
  code: z.string().length(6, 'OTP must be 6 digits'),
});

const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(10, 'Refresh token required'),
});

export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // 1. POST /auth/otp/request
  app.post('/otp/request', async (req: FastifyRequest, reply: FastifyReply) => {
    const parse = RequestOtpSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parse.error.format(),
      });
    }

    try {
      const result = await authService.requestOtp(parse.data.phone);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(429).send({ error: err.message });
    }
  });

  // 2. POST /auth/otp/verify
  app.post('/otp/verify', async (req: FastifyRequest, reply: FastifyReply) => {
    const parse = VerifyOtpSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parse.error.format(),
      });
    }

    try {
      const session = await authService.verifyOtp(parse.data.phone, parse.data.code);
      return reply.send(session);
    } catch (err: any) {
      return reply.status(401).send({ error: err.message });
    }
  });

  // 3. POST /auth/refresh
  app.post('/refresh', async (req: FastifyRequest, reply: FastifyReply) => {
    const parse = RefreshTokenSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Refresh token required' });
    }

    try {
      const tokens = await authService.refreshSession(parse.data.refreshToken);
      return reply.send(tokens);
    } catch (err: any) {
      return reply.status(401).send({ error: err.message });
    }
  });

  // 4. POST /auth/logout
  app.post('/logout', async (req: FastifyRequest, reply: FastifyReply) => {
    const parse = RefreshTokenSchema.safeParse(req.body);
    if (parse.success) {
      await authService.logout(parse.data.refreshToken);
    }
    return reply.send({ success: true, message: 'Logged out successfully' });
  });

  // 5. GET /auth/me
  app.get('/me', async (req: FastifyRequest, reply: FastifyReply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production_super_safe_key_123456';

    try {
      const decoded = jwt.verify(token, jwtSecret) as { sub: string; activeRole: string; restaurantId?: string };
      const user = await db.query.users.findFirst({
        where: eq(users.id, decoded.sub),
      });

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      let restaurantDetails = null;
      if (decoded.restaurantId) {
        const rest = await db.query.restaurants.findFirst({
          where: eq(restaurants.id, decoded.restaurantId),
        });
        if (rest) {
          restaurantDetails = {
            id: rest.id,
            name: rest.name,
            slug: rest.slug,
          };
        }
      }

      return reply.send({
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
          email: user.email,
          roles: user.roles,
          isDemo: user.isDemo,
        },
        activeRole: decoded.activeRole,
        restaurant: restaurantDetails,
      });
    } catch (err) {
      return reply.status(401).send({ error: 'Invalid or expired access token' });
    }
  });
};
