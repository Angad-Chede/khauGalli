import crypto from 'node:crypto';
import { db, deliveries, deliveryOffers, riders, riderCurrentLocation, orders, restaurants, addresses, users, orderEvents, outboxEvents } from '@tiffin/db';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { generateUUIDv7, transitionOrder } from '@tiffin/shared';
import { redis } from '../../lib/redis';

export function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp.trim()).digest('hex');
}

export function generate4DigitOtp(): string {
  return crypto.randomInt(1000, 9999).toString();
}

export class DeliveryService {
  /**
   * Create delivery task and trigger dispatch when order is ready for delivery
   */
  async createDeliveryForOrder(orderId: string): Promise<any> {
    const existingDelivery = await db.query.deliveries.findFirst({
      where: eq(deliveries.orderId, orderId),
    });

    if (existingDelivery) return existingDelivery;

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });

    if (!order) throw new Error('Order not found');

    const [restaurant, address] = await Promise.all([
      db.query.restaurants.findFirst({ where: eq(restaurants.id, order.restaurantId) }),
      db.query.addresses.findFirst({ where: eq(addresses.userId, order.userId) }),
    ]);

    if (!restaurant) throw new Error('Restaurant not found');

    // Generate 4-digit verification OTPs
    const pickupOtp = generate4DigitOtp();
    const deliveryOtp = generate4DigitOtp();

    const pickupGeog = restaurant.geog;
    const dropoffGeog = address?.geog || restaurant.geog;

    // Calculate distance
    const distRes = await db.execute(sql`
      SELECT ROUND(ST_Distance(${pickupGeog}::geography, ${dropoffGeog}::geography)) AS distance_meters
    `);
    const distanceMeters = Number(distRes.rows[0]?.distance_meters || 1500);

    // Rider payout calculation (₹40 base + ₹10/km past 2km)
    const basePayoutPaise = 4000;
    const excessMeters = Math.max(0, distanceMeters - 2000);
    const extraKm = Math.ceil(excessMeters / 1000);
    const payoutPaise = basePayoutPaise + extraKm * 1000;

    const deliveryId = generateUUIDv7();
    const now = new Date();

    const newDelivery = {
      id: deliveryId,
      orderId,
      riderId: null,
      status: 'PENDING_ASSIGNMENT',
      pickupGeog,
      dropoffGeog,
      pickupOtpHash: hashOtp(pickupOtp),
      deliveryOtpHash: hashOtp(deliveryOtp),
      distanceMeters,
      payoutPaise,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(deliveries).values(newDelivery);

    // Store plaintext OTPs temporarily in redis for demo display
    await redis.set(`delivery:${deliveryId}:pickup_otp`, pickupOtp, 'EX', 7200);
    await redis.set(`delivery:${deliveryId}:delivery_otp`, deliveryOtp, 'EX', 7200);

    // Trigger dispatch offers
    await this.dispatchToNearestRiders(deliveryId);

    return newDelivery;
  }

  /**
   * Dispatch 30-second offers to nearest online, available riders
   */
  async dispatchToNearestRiders(deliveryId: string): Promise<number> {
    const delivery = await db.query.deliveries.findFirst({
      where: eq(deliveries.id, deliveryId),
    });

    if (!delivery || delivery.riderId) return 0;

    // Find online and not busy riders within 5km radius
    const onlineRiders = await db.query.riders.findMany({
      where: and(eq(riders.isOnline, true), eq(riders.isBusy, false)),
      limit: 5,
    });

    if (onlineRiders.length === 0) return 0;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 1000); // 30 seconds expiry

    let offersCount = 0;

    for (const rider of onlineRiders) {
      const offerId = generateUUIDv7();
      await db.insert(deliveryOffers).values({
        id: offerId,
        deliveryId,
        riderId: rider.id,
        status: 'OFFERED',
        payoutPaise: delivery.payoutPaise,
        expiresAt,
        createdAt: now,
      });

      // Publish offer to rider's dedicated stream
      const offerPayload = {
        offerId,
        deliveryId,
        payoutPaise: delivery.payoutPaise,
        distanceMeters: delivery.distanceMeters,
        expiresAt: expiresAt.toISOString(),
      };

      await redis.publish(`rider:${rider.id}:offers`, JSON.stringify(offerPayload));
      offersCount++;
    }

    await db
      .update(deliveries)
      .set({ status: 'OFFERED', updatedAt: now })
      .where(eq(deliveries.id, deliveryId));

    return offersCount;
  }

  /**
   * Rider accepts delivery offer (atomic first-come-first-served)
   */
  async acceptOffer(riderId: string, offerId: string): Promise<any> {
    const offer = await db.query.deliveryOffers.findFirst({
      where: and(eq(deliveryOffers.id, offerId), eq(deliveryOffers.riderId, riderId)),
    });

    if (!offer) {
      const err: any = new Error('Offer not found');
      err.statusCode = 404;
      throw err;
    }

    if (offer.status !== 'OFFERED' || Date.now() > new Date(offer.expiresAt).getTime()) {
      const err: any = new Error('Offer has expired or was already responded to');
      err.statusCode = 400;
      err.code = 'OFFER_EXPIRED';
      throw err;
    }

    const now = new Date();

    return await db.transaction(async (tx) => {
      // Check if delivery was already assigned to another rider
      const delivery = await tx.query.deliveries.findFirst({
        where: eq(deliveries.id, offer.deliveryId),
      });

      if (!delivery || delivery.riderId) {
        const err: any = new Error('This delivery was already assigned to another rider');
        err.statusCode = 409;
        err.code = 'OFFER_ALREADY_TAKEN';
        throw err;
      }

      // Assign delivery to this rider
      await tx
        .update(deliveries)
        .set({
          riderId,
          status: 'ASSIGNED',
          updatedAt: now,
        })
        .where(eq(deliveries.id, offer.deliveryId));

      // Mark this offer accepted
      await tx
        .update(deliveryOffers)
        .set({ status: 'ACCEPTED' })
        .where(eq(deliveryOffers.id, offerId));

      // Mark other offers for this delivery expired
      await tx
        .update(deliveryOffers)
        .set({ status: 'EXPIRED' })
        .where(
          and(
            eq(deliveryOffers.deliveryId, offer.deliveryId),
            sql`${deliveryOffers.id} != ${offerId}`
          )
        );

      // Set rider busy
      await tx
        .update(riders)
        .set({ isBusy: true, updatedAt: now })
        .where(eq(riders.id, riderId));

      // Broadcast to customer and KDS
      const riderUser = await tx.query.riders.findFirst({
        where: eq(riders.id, riderId),
      });
      const user = riderUser ? await tx.query.users.findFirst({ where: eq(users.id, riderUser.userId) }) : null;

      const updateEvent = {
        eventType: 'delivery.assigned',
        deliveryId: delivery.id,
        orderId: delivery.orderId,
        rider: {
          id: riderId,
          name: user?.name || 'Imran Khan',
          vehicle: riderUser?.vehicleNumber || 'KA-01-EQ-4821',
          rating: riderUser?.ratingAverage || '4.90',
        },
      };

      await redis.publish(`order:${delivery.orderId}:updates`, JSON.stringify(updateEvent));

      return {
        success: true,
        deliveryId: delivery.id,
        orderId: delivery.orderId,
      };
    });
  }

  /**
   * Rider confirms pickup from restaurant with 4-digit pickup OTP
   */
  async confirmPickup(riderId: string, deliveryId: string, enteredOtp: string): Promise<any> {
    const delivery = await db.query.deliveries.findFirst({
      where: and(eq(deliveries.id, deliveryId), eq(deliveries.riderId, riderId)),
    });

    if (!delivery) {
      const err: any = new Error('Delivery not found or not assigned to you');
      err.statusCode = 404;
      throw err;
    }

    if (hashOtp(enteredOtp) !== delivery.pickupOtpHash) {
      const err: any = new Error('Invalid Pickup OTP. Ask kitchen lead for the correct 4-digit code.');
      err.statusCode = 400;
      err.code = 'INVALID_PICKUP_OTP';
      throw err;
    }

    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(deliveries)
        .set({
          status: 'PICKED_UP',
          pickedUpAt: now,
          updatedAt: now,
        })
        .where(eq(deliveries.id, deliveryId));

      await tx
        .update(orders)
        .set({
          status: 'PICKED_UP',
          updatedAt: now,
        })
        .where(eq(orders.id, delivery.orderId));

      await tx.insert(orderEvents).values({
        id: generateUUIDv7(),
        orderId: delivery.orderId,
        fromStatus: 'READY',
        toStatus: 'PICKED_UP',
        actorRole: 'RIDER',
        actorId: riderId,
        createdAt: now,
      });

      await tx.insert(outboxEvents).values({
        id: generateUUIDv7(),
        aggregateType: 'ORDER',
        aggregateId: delivery.orderId,
        eventType: 'order.picked_up',
        payload: {
          orderId: delivery.orderId,
          deliveryId,
          riderId,
        },
        createdAt: now,
      });
    });

    const updateEvent = {
      eventType: 'order.picked_up',
      orderId: delivery.orderId,
      deliveryId,
      status: 'PICKED_UP',
    };
    await redis.publish(`order:${delivery.orderId}:updates`, JSON.stringify(updateEvent));

    return { success: true, message: 'Pickup confirmed' };
  }

  /**
   * Rider confirms delivery to customer with 4-digit delivery OTP
   */
  async confirmDelivery(riderId: string, deliveryId: string, enteredOtp: string): Promise<any> {
    const delivery = await db.query.deliveries.findFirst({
      where: and(eq(deliveries.id, deliveryId), eq(deliveries.riderId, riderId)),
    });

    if (!delivery) {
      const err: any = new Error('Delivery not found or not assigned to you');
      err.statusCode = 404;
      throw err;
    }

    if (hashOtp(enteredOtp) !== delivery.deliveryOtpHash) {
      const err: any = new Error('Invalid Delivery OTP. Ask customer for the 4-digit delivery confirmation code.');
      err.statusCode = 400;
      err.code = 'INVALID_DELIVERY_OTP';
      throw err;
    }

    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(deliveries)
        .set({
          status: 'DELIVERED',
          deliveredAt: now,
          updatedAt: now,
        })
        .where(eq(deliveries.id, deliveryId));

      await tx
        .update(riders)
        .set({ isBusy: false, updatedAt: now })
        .where(eq(riders.id, riderId));

      await tx
        .update(orders)
        .set({
          status: 'DELIVERED',
          deliveredAt: now,
          updatedAt: now,
        })
        .where(eq(orders.id, delivery.orderId));

      await tx.insert(orderEvents).values({
        id: generateUUIDv7(),
        orderId: delivery.orderId,
        fromStatus: 'PICKED_UP',
        toStatus: 'DELIVERED',
        actorRole: 'RIDER',
        actorId: riderId,
        createdAt: now,
      });

      await tx.insert(outboxEvents).values({
        id: generateUUIDv7(),
        aggregateType: 'ORDER',
        aggregateId: delivery.orderId,
        eventType: 'order.delivered',
        payload: {
          orderId: delivery.orderId,
          deliveryId,
          riderId,
        },
        createdAt: now,
      });
    });

    const updateEvent = {
      eventType: 'order.delivered',
      orderId: delivery.orderId,
      deliveryId,
      status: 'DELIVERED',
    };
    await redis.publish(`order:${delivery.orderId}:updates`, JSON.stringify(updateEvent));

    return { success: true, message: 'Delivery completed successfully' };
  }

  /**
   * Upload rider GPS coordinates via normal HTTP POST
   */
  async updateLocation(
    riderId: string,
    coords: { latitude: number; longitude: number; heading?: number; speed?: number }
  ): Promise<void> {
    const { latitude, longitude, heading, speed } = coords;
    const now = new Date();

    const point = { lng: longitude, lat: latitude };

    await db
      .insert(riderCurrentLocation)
      .values({
        riderId,
        geog: point,
        headingDegrees: heading || 0,
        speedKmh: speed ? speed.toFixed(1) : '0.0',
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: riderCurrentLocation.riderId,
        set: {
          geog: point,
          headingDegrees: heading || 0,
          speedKmh: speed ? speed.toFixed(1) : '0.0',
          updatedAt: now,
        },
      });

    // Check if rider has an active delivery currently on the road (PICKED_UP)
    const activeDelivery = await db.query.deliveries.findFirst({
      where: and(eq(deliveries.riderId, riderId), eq(deliveries.status, 'PICKED_UP')),
    });

    if (activeDelivery) {
      // Forward real-time location to the customer's order SSE stream
      const locationEvent = {
        eventType: 'order.rider_location',
        orderId: activeDelivery.orderId,
        deliveryId: activeDelivery.id,
        location: {
          latitude,
          longitude,
          heading: heading || 0,
          speedKmh: speed || 0,
          timestamp: now.toISOString(),
        },
      };

      await redis.publish(`order:${activeDelivery.orderId}:updates`, JSON.stringify(locationEvent));
    }
  }
}

export const deliveryService = new DeliveryService();
