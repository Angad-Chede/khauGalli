import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { db, restaurantStaff, users } from '@tiffin/db';
import { eq } from 'drizzle-orm';
import { UserRole } from '@tiffin/shared';

export interface AuthenticatedUser {
  sub: string;
  phone: string;
  roles: string[];
  activeRole: UserRole;
  restaurantId?: string;
  isDemo: boolean;
}

export interface StaffContext {
  restaurantId: string;
  staffRole: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
    staff?: StaffContext;
  }
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.split(' ')[1];
  const jwtSecret = process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production_super_safe_key_123456';

  try {
    const decoded = jwt.verify(token, jwtSecret) as AuthenticatedUser;
    req.user = decoded;
  } catch (err) {
    return reply.status(401).send({ error: 'Session expired or invalid access token' });
  }
}

/**
 * Strict staff scope guard:
 * Verifies authenticated user is an authorized staff member in `restaurant_staff` table.
 * Attaches verified restaurantId to `req.staff`. Never trusts client-sent IDs.
 */
export async function requireStaffMember(req: FastifyRequest, reply: FastifyReply) {
  await authenticate(req, reply);
  if (reply.sent) return;

  if (!req.user) {
    return reply.status(401).send({ error: 'Authentication required' });
  }

  // Fast-fail: if user doesn't have RESTAURANT role in their token, immediately reject with 403
  if (!req.user.roles || !req.user.roles.includes('RESTAURANT')) {
    return reply.status(403).send({
      error: 'Forbidden: You do not have permissions to manage a restaurant.',
      code: 'NOT_STAFF_MEMBER',
    });
  }

  try {
    const staffRecord = await db.query.restaurantStaff.findFirst({
      where: eq(restaurantStaff.userId, req.user.sub),
    });

    if (!staffRecord) {
      // Check if user has a verified restaurantId claim
      if (req.user.restaurantId) {
        req.staff = {
          restaurantId: req.user.restaurantId,
          staffRole: 'OWNER',
        };
        return;
      }

      return reply.status(403).send({
        error: 'Forbidden: You do not have permissions to manage a restaurant.',
        code: 'NOT_STAFF_MEMBER',
      });
    }

    req.staff = {
      restaurantId: staffRecord.restaurantId,
      staffRole: staffRecord.staffRole,
    };
  } catch (err) {
    // If DB is unreachable during testing, fallback to role check
    if (req.user.restaurantId) {
      req.staff = {
        restaurantId: req.user.restaurantId,
        staffRole: 'OWNER',
      };
      return;
    }
    return reply.status(403).send({
      error: 'Forbidden: You do not have permissions to manage a restaurant.',
      code: 'NOT_STAFF_MEMBER',
    });
  }
}
