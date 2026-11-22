import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { db, orders, orderEvents, restaurantStaff, riders, deliveries } from '@tiffin/db';
import { eq, and, sql, gt } from 'drizzle-orm';
import { redis } from '../../lib/redis';

interface AuthenticatedUser {
  sub: string;
  phone: string;
  roles: string[];
  activeRole: string;
  restaurantId?: string;
  isDemo?: boolean;
}

function extractUserFromRequest(req: FastifyRequest): AuthenticatedUser | null {
  const jwtSecret = process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production_super_safe_key_123456';
  const query = req.query as Record<string, string | undefined>;

  // Check query ticket token (used by browser EventSource), Authorization header, or cookie
  const token =
    query.token ||
    (req.headers.authorization ? req.headers.authorization.replace('Bearer ', '') : undefined) ||
    (req.headers.cookie
      ? req.headers.cookie
          .split(';')
          .find((c) => c.trim().startsWith('tiffin_token='))
          ?.split('=')[1]
      : undefined);

  if (!token) return null;

  try {
    return jwt.verify(token, jwtSecret) as AuthenticatedUser;
  } catch {
    return null;
  }
}

export const sseRealtimeRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /**
   * GET /realtime/orders/:id
   * Server-Sent Events stream for order lifecycle updates and rider GPS coordinates
   */
  app.get('/orders/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const orderId = req.params.id;
    const user = extractUserFromRequest(req);

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Valid token required via ?token= query parameter for EventSource connection.',
      });
    }

    // 1. Load order and verify existence
    const orderRecord = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });

    if (!orderRecord) {
      return reply.status(404).send({ error: 'Order not found' });
    }

    // 2. Multi-tenant Channel Authorization Scoping
    const isCustomerOwner = orderRecord.userId === user.sub;
    const isAdmin = user.roles.includes('ADMIN');

    let isAuthorizedStaff = false;
    if (user.roles.includes('RESTAURANT')) {
      const staff = await db.query.restaurantStaff.findFirst({
        where: and(
          eq(restaurantStaff.userId, user.sub),
          eq(restaurantStaff.restaurantId, orderRecord.restaurantId)
        ),
      });
      isAuthorizedStaff = Boolean(staff);
    }

    let isAssignedRider = false;
    if (user.roles.includes('RIDER')) {
      const riderRecord = await db.query.riders.findFirst({
        where: eq(riders.userId, user.sub),
      });
      if (riderRecord) {
        const deliveryRecord = await db.query.deliveries.findFirst({
          where: and(eq(deliveries.orderId, orderId), eq(deliveries.riderId, riderRecord.id)),
        });
        isAssignedRider = Boolean(deliveryRecord);
      }
    }

    if (!isCustomerOwner && !isAuthorizedStaff && !isAssignedRider && !isAdmin) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'You are not authorized to subscribe to realtime events for this order.',
      });
    }

    // 3. Set anti-buffering SSE headers
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Critical: disables Nginx / Cloudflare reverse proxy buffering
      'Access-Control-Allow-Origin': '*',
    });

    // Initial connection acknowledgment
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ orderId, status: orderRecord.status })}\n\n`);

    // 4. Handle Reconnect Replay via Last-Event-ID
    const lastEventId =
      (req.headers['last-event-id'] as string) || (req.query as any)?.lastEventId;

    if (lastEventId) {
      try {
        const missedEvents = await db.query.orderEvents.findMany({
          where: eq(orderEvents.orderId, orderId),
          orderBy: (events, { asc }) => [asc(events.createdAt)],
        });

        for (const evt of missedEvents) {
          reply.raw.write(
            `id: ${evt.id}\nevent: order.event\ndata: ${JSON.stringify({
              fromStatus: evt.fromStatus,
              toStatus: evt.toStatus,
              actorRole: evt.actorRole,
              payload: evt.payload,
              createdAt: evt.createdAt,
            })}\n\n`
          );
        }
      } catch {
        // Fallback
      }
    }

    // 5. 15-Second Heartbeat Keepalive (prevents cellular NAT drops)
    const keepaliveTimer = setInterval(() => {
      try {
        reply.raw.write(':keepalive\n\n');
      } catch {
        clearInterval(keepaliveTimer);
      }
    }, 15000);

    // 6. Subscribe to Redis order updates channel
    const channelName = `order:${orderId}:updates`;
    const unsubscribe = redis.subscribe(channelName, (rawMessage: string) => {
      try {
        const parsed = JSON.parse(rawMessage);
        const eventType = parsed.eventType || 'order.update';
        const eventId = parsed.id || `${Date.now()}`;
        reply.raw.write(`id: ${eventId}\nevent: ${eventType}\ndata: ${JSON.stringify(parsed.payload || parsed)}\n\n`);
      } catch {
        reply.raw.write(`event: order.update\ndata: ${rawMessage}\n\n`);
      }
    });

    // 7. Clean Teardown on Client Disconnection
    req.raw.on('close', () => {
      clearInterval(keepaliveTimer);
      unsubscribe();
      reply.raw.end();
    });
  });

  /**
   * GET /realtime/restaurants/:id/orders
   * KDS stream pushing incoming orders to kitchen lead
   */
  app.get('/restaurants/:id/orders', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const restaurantId = req.params.id;
    const user = extractUserFromRequest(req);

    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const isAdmin = user.roles.includes('ADMIN');
    let isStaff = false;

    if (user.roles.includes('RESTAURANT')) {
      const staffRecord = await db.query.restaurantStaff.findFirst({
        where: and(
          eq(restaurantStaff.userId, user.sub),
          eq(restaurantStaff.restaurantId, restaurantId)
        ),
      });
      isStaff = Boolean(staffRecord);
    }

    if (!isStaff && !isAdmin) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    });

    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ restaurantId })}\n\n`);

    const keepaliveTimer = setInterval(() => {
      try {
        reply.raw.write(':keepalive\n\n');
      } catch {
        clearInterval(keepaliveTimer);
      }
    }, 15000);

    const channelName = `restaurant:${restaurantId}:orders`;
    const unsubscribe = redis.subscribe(channelName, (rawMessage: string) => {
      try {
        const parsed = JSON.parse(rawMessage);
        reply.raw.write(`event: order.incoming\ndata: ${JSON.stringify(parsed.payload || parsed)}\n\n`);
      } catch {
        reply.raw.write(`event: order.incoming\ndata: ${rawMessage}\n\n`);
      }
    });

    req.raw.on('close', () => {
      clearInterval(keepaliveTimer);
      unsubscribe();
      reply.raw.end();
    });
  });

  /**
   * GET /realtime/rider/offers
   * Stream pushing 30-second delivery offers to online delivery partner
   */
  app.get('/rider/offers', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = extractUserFromRequest(req);
    if (!user || !user.roles.includes('RIDER')) {
      return reply.status(403).send({ error: 'Forbidden: Rider role required' });
    }

    let rider = await db.query.riders.findFirst({
      where: eq(riders.userId, user.sub),
    });

    if (!rider) {
      return reply.status(404).send({ error: 'Rider profile not found' });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    });

    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ riderId: rider.id })}\n\n`);

    const keepaliveTimer = setInterval(() => {
      try {
        reply.raw.write(':keepalive\n\n');
      } catch {
        clearInterval(keepaliveTimer);
      }
    }, 15000);

    const channelName = `rider:${rider.id}:offers`;
    const unsubscribe = redis.subscribe(channelName, (rawMessage: string) => {
      reply.raw.write(`event: delivery.offer\ndata: ${rawMessage}\n\n`);
    });

    req.raw.on('close', () => {
      clearInterval(keepaliveTimer);
      unsubscribe();
      reply.raw.end();
    });
  });
};
