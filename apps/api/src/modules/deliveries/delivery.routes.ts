import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { deliveryService } from './delivery.service';
import { authenticate } from '../../middleware/auth.middleware';
import { db, riders, deliveries, deliveryOffers, orders, restaurants } from '@tiffin/db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { redis } from '../../lib/redis';

const LocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  heading: z.number().optional(),
  speed: z.number().optional(),
});

const StatusToggleSchema = z.object({
  isOnline: z.boolean(),
});

const OtpVerifySchema = z.object({
  otp: z.string().length(4, 'OTP must be exactly 4 digits'),
});

export const deliveryRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', authenticate);

  // Helper to ensure current user is an active registered rider
  async function getRiderOrThrow(userId: string) {
    let rider = await db.query.riders.findFirst({
      where: eq(riders.userId, userId),
    });

    if (!rider) {
      // Auto-create rider record for demo partner Imran Khan if needed
      const [newRider] = await db
        .insert(riders)
        .values({
          id: userId,
          userId,
          vehicleType: 'MOTORCYCLE',
          vehicleNumber: 'KA-01-EQ-4821',
          isOnline: true,
          isBusy: false,
        })
        .returning();
      return newRider;
    }
    return rider;
  }

  // POST /rider/status (Toggle online/offline)
  app.post('/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const parse = StatusToggleSchema.safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: 'Invalid payload' });

    const userId = req.user!.sub;
    const rider = await getRiderOrThrow(userId);

    await db
      .update(riders)
      .set({ isOnline: parse.data.isOnline, updatedAt: new Date() })
      .where(eq(riders.id, rider.id));

    return reply.send({ success: true, isOnline: parse.data.isOnline });
  });

  // POST /rider/location (Normal HTTP POST for GPS coordinates upload)
  app.post('/location', async (req: FastifyRequest, reply: FastifyReply) => {
    const parse = LocationSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Invalid GPS coordinates', details: parse.error.format() });
    }

    const userId = req.user!.sub;
    const rider = await getRiderOrThrow(userId);

    await deliveryService.updateLocation(rider.id, parse.data);
    return reply.send({ success: true, message: 'Location updated' });
  });

  // GET /rider/offers (List active 30s offers for rider)
  app.get('/offers', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = req.user!.sub;
    const rider = await getRiderOrThrow(userId);

    const activeOffers = await db.query.deliveryOffers.findMany({
      where: and(
        eq(deliveryOffers.riderId, rider.id),
        eq(deliveryOffers.status, 'OFFERED')
      ),
      orderBy: [desc(deliveryOffers.createdAt)],
    });

    const now = Date.now();
    const validOffers = activeOffers.filter((o) => new Date(o.expiresAt).getTime() > now);

    return reply.send({ offers: validOffers });
  });

  // POST /rider/offers/:id/accept
  app.post(
    '/offers/:id/accept',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const userId = req.user!.sub;
      const rider = await getRiderOrThrow(userId);
      const offerId = req.params.id;

      try {
        const result = await deliveryService.acceptOffer(rider.id, offerId);
        return reply.send(result);
      } catch (err: any) {
        return reply.status(err.statusCode || 400).send({
          code: err.code || 'ACCEPT_OFFER_FAILED',
          error: err.message,
        });
      }
    }
  );

  // GET /rider/active (Current assigned delivery task)
  app.get('/active', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = req.user!.sub;
    const rider = await getRiderOrThrow(userId);

    const activeDelivery = await db.query.deliveries.findFirst({
      where: and(
        eq(deliveries.riderId, rider.id),
        sql`${deliveries.status} IN ('ASSIGNED', 'ARRIVED_AT_STORE', 'PICKED_UP', 'ARRIVED_AT_CUSTOMER')`
      ),
    });

    if (!activeDelivery) return reply.send({ activeDelivery: null });

    const [order, restaurant] = await Promise.all([
      db.query.orders.findFirst({ where: eq(orders.id, activeDelivery.orderId) }),
      db.query.restaurants.findFirst({
        where: sql`${restaurants.id} = (SELECT restaurant_id FROM orders WHERE id = ${activeDelivery.orderId})`,
      }),
    ]);

    // Retrieve plaintext OTPs for demo display
    const pickupOtp = await redis.get(`delivery:${activeDelivery.id}:pickup_otp`);
    const deliveryOtp = await redis.get(`delivery:${activeDelivery.id}:delivery_otp`);

    return reply.send({
      activeDelivery: {
        ...activeDelivery,
        order,
        restaurant,
        pickupOtp: pickupOtp || '1234',
        deliveryOtp: deliveryOtp || '5678',
      },
    });
  });

  // POST /rider/deliveries/:id/pickup
  app.post(
    '/deliveries/:id/pickup',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const parse = OtpVerifySchema.safeParse(req.body);
      if (!parse.success) return reply.status(400).send({ error: '4-digit OTP required' });

      const userId = req.user!.sub;
      const rider = await getRiderOrThrow(userId);
      const deliveryId = req.params.id;

      try {
        const result = await deliveryService.confirmPickup(rider.id, deliveryId, parse.data.otp);
        return reply.send(result);
      } catch (err: any) {
        return reply.status(err.statusCode || 400).send({
          code: err.code || 'PICKUP_FAILED',
          error: err.message,
        });
      }
    }
  );

  // POST /rider/deliveries/:id/complete
  app.post(
    '/deliveries/:id/complete',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const parse = OtpVerifySchema.safeParse(req.body);
      if (!parse.success) return reply.status(400).send({ error: '4-digit OTP required' });

      const userId = req.user!.sub;
      const rider = await getRiderOrThrow(userId);
      const deliveryId = req.params.id;

      try {
        const result = await deliveryService.confirmDelivery(rider.id, deliveryId, parse.data.otp);
        return reply.send(result);
      } catch (err: any) {
        return reply.status(err.statusCode || 400).send({
          code: err.code || 'DELIVERY_FAILED',
          error: err.message,
        });
      }
    }
  );
};
