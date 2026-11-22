import { db, orders, orderItems, orderEvents, payments, refunds, outboxEvents } from '@tiffin/db';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { generateUUIDv7, transitionOrder, OrderStatus } from '@tiffin/shared';
import { razorpayClient } from '../../lib/razorpay';

export class RestaurantOrdersService {
  /**
   * Fetch active orders for kitchen display (PLACED, ACCEPTED, PREPARING, READY)
   */
  async getActiveOrders(restaurantId: string): Promise<any[]> {
    const activeStatuses: OrderStatus[] = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'];

    const activeOrders = await db.query.orders.findMany({
      where: and(
        eq(orders.restaurantId, restaurantId),
        inArray(orders.status, activeStatuses)
      ),
      orderBy: [desc(orders.createdAt)],
    });

    if (activeOrders.length === 0) return [];

    const orderIds = activeOrders.map((o) => o.id);
    const items = await db.query.orderItems.findMany({
      where: sql`${orderItems.orderId} = ANY(${orderIds})`,
    });

    const now = Date.now();

    return activeOrders.map((order) => {
      const orderItemsList = items.filter((i) => i.orderId === order.id);
      const placedTimestamp = order.placedAt ? new Date(order.placedAt).getTime() : new Date(order.createdAt).getTime();
      const elapsedSeconds = Math.max(0, Math.floor((now - placedTimestamp) / 1000));
      const autoRejectRemainingSeconds = Math.max(0, 180 - elapsedSeconds);

      return {
        ...order,
        items: orderItemsList,
        elapsedSeconds,
        autoRejectRemainingSeconds,
      };
    });
  }

  /**
   * Restaurant Kitchen accepts order with estimated preparation time
   */
  async acceptOrder(
    restaurantId: string,
    orderId: string,
    staffId: string,
    prepTimeMinutes: number = 20
  ): Promise<any> {
    const order = await db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)),
    });

    if (!order) {
      const err: any = new Error('Order not found or does not belong to this restaurant');
      err.statusCode = 404;
      throw err;
    }

    // Evaluate state machine transition
    const transitionResult = transitionOrder(order.status as OrderStatus, 'ACCEPTED', {
      actorRole: 'RESTAURANT',
      actorId: staffId,
      payload: { prepTimeMinutes },
    });

    if (!transitionResult.ok) {
      const err: any = new Error(transitionResult.error);
      err.statusCode = 400;
      err.code = transitionResult.code;
      throw err;
    }

    const now = new Date();

    await db.transaction(async (tx) => {
      // Kitchen moves from PLACED -> PREPARING directly
      await tx
        .update(orders)
        .set({
          status: 'PREPARING',
          prepTimeMinutes,
          acceptedAt: now,
          updatedAt: now,
        })
        .where(eq(orders.id, orderId));

      await tx.insert(orderEvents).values({
        id: generateUUIDv7(),
        orderId,
        fromStatus: order.status,
        toStatus: 'PREPARING',
        actorRole: 'RESTAURANT',
        actorId: staffId,
        payload: { prepTimeMinutes },
        createdAt: now,
      });

      await tx.insert(outboxEvents).values({
        id: generateUUIDv7(),
        aggregateType: 'ORDER',
        aggregateId: orderId,
        eventType: 'order.preparing',
        payload: {
          orderId,
          restaurantId,
          orderNumber: order.orderNumber,
          prepTimeMinutes,
        },
        createdAt: now,
      });
    });

    return await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  }

  /**
   * Restaurant Kitchen rejects order (requires reason; triggers refund if paid online)
   */
  async rejectOrder(
    restaurantId: string,
    orderId: string,
    staffId: string,
    rejectionReason: string
  ): Promise<any> {
    const order = await db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)),
    });

    if (!order) {
      const err: any = new Error('Order not found or does not belong to this restaurant');
      err.statusCode = 404;
      throw err;
    }

    const transitionResult = transitionOrder(order.status as OrderStatus, 'REJECTED_BY_RESTAURANT', {
      actorRole: 'RESTAURANT',
      actorId: staffId,
      payload: { rejectionReason },
    });

    if (!transitionResult.ok) {
      const err: any = new Error(transitionResult.error);
      err.statusCode = 400;
      err.code = transitionResult.code;
      throw err;
    }

    const now = new Date();

    // Check if online refund needed
    let refundRow: any = null;
    const payment = await db.query.payments.findFirst({
      where: and(eq(payments.orderId, orderId), eq(payments.status, 'CAPTURED')),
    });

    if (payment && payment.razorpayPaymentId) {
      const refundResult = await razorpayClient.issueRefund({
        paymentId: payment.razorpayPaymentId,
        amountPaise: payment.amountPaise,
        notes: { orderId, rejectionReason },
      });

      refundRow = {
        id: generateUUIDv7(),
        orderId,
        paymentId: payment.id,
        amountPaise: payment.amountPaise,
        reason: rejectionReason,
        providerRefundId: refundResult.id,
        status: 'PROCESSED',
        createdAt: now,
      };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          status: 'REJECTED_BY_RESTAURANT',
          cancellationReason: rejectionReason,
          updatedAt: now,
        })
        .where(eq(orders.id, orderId));

      await tx.insert(orderEvents).values({
        id: generateUUIDv7(),
        orderId,
        fromStatus: order.status,
        toStatus: 'REJECTED_BY_RESTAURANT',
        actorRole: 'RESTAURANT',
        actorId: staffId,
        payload: { rejectionReason },
        createdAt: now,
      });

      await tx.insert(outboxEvents).values({
        id: generateUUIDv7(),
        aggregateType: 'ORDER',
        aggregateId: orderId,
        eventType: 'order.rejected',
        payload: {
          orderId,
          restaurantId,
          orderNumber: order.orderNumber,
          rejectionReason,
          refunded: Boolean(refundRow),
        },
        createdAt: now,
      });

      if (refundRow) {
        await tx.insert(refunds).values(refundRow);
      }
    });

    return await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  }

  /**
   * Mark order READY for courier pickup
   */
  async markReady(restaurantId: string, orderId: string, staffId: string): Promise<any> {
    const order = await db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)),
    });

    if (!order) {
      const err: any = new Error('Order not found or does not belong to this restaurant');
      err.statusCode = 404;
      throw err;
    }

    const transitionResult = transitionOrder(order.status as OrderStatus, 'READY', {
      actorRole: 'RESTAURANT',
      actorId: staffId,
    });

    if (!transitionResult.ok) {
      const err: any = new Error(transitionResult.error);
      err.statusCode = 400;
      err.code = transitionResult.code;
      throw err;
    }

    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          status: 'READY',
          readyAt: now,
          updatedAt: now,
        })
        .where(eq(orders.id, orderId));

      await tx.insert(orderEvents).values({
        id: generateUUIDv7(),
        orderId,
        fromStatus: order.status,
        toStatus: 'READY',
        actorRole: 'RESTAURANT',
        actorId: staffId,
        createdAt: now,
      });

      await tx.insert(outboxEvents).values({
        id: generateUUIDv7(),
        aggregateType: 'ORDER',
        aggregateId: orderId,
        eventType: 'order.ready',
        payload: {
          orderId,
          restaurantId,
          orderNumber: order.orderNumber,
        },
        createdAt: now,
      });
    });

    return await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  }

  /**
   * Auto-expire stale placed orders that exceeded the 3-minute acceptance window
   */
  async autoExpireStaleOrders(olderThanSeconds: number = 180): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanSeconds * 1000);

    const staleOrders = await db.query.orders.findMany({
      where: and(
        eq(orders.status, 'PLACED'),
        sql`${orders.placedAt} IS NOT NULL AND ${orders.placedAt} < ${cutoff}`
      ),
    });

    let expiredCount = 0;
    const now = new Date();

    for (const order of staleOrders) {
      const transitionResult = transitionOrder(order.status as OrderStatus, 'EXPIRED', {
        actorRole: 'SYSTEM',
        payload: { note: `Auto-expired after ${olderThanSeconds}s acceptance window` },
      });

      if (!transitionResult.ok) continue;

      let refundRow: any = null;
      const payment = await db.query.payments.findFirst({
        where: and(eq(payments.orderId, order.id), eq(payments.status, 'CAPTURED')),
      });

      if (payment && payment.razorpayPaymentId) {
        const refundResult = await razorpayClient.issueRefund({
          paymentId: payment.razorpayPaymentId,
          amountPaise: payment.amountPaise,
          notes: { orderId: order.id, reason: 'Auto-expired: Restaurant did not accept within 3 minutes' },
        });

        refundRow = {
          id: generateUUIDv7(),
          orderId: order.id,
          paymentId: payment.id,
          amountPaise: payment.amountPaise,
          reason: 'Restaurant acceptance window timed out',
          providerRefundId: refundResult.id,
          status: 'PROCESSED',
          createdAt: now,
        };
      }

      await db.transaction(async (tx) => {
        await tx
          .update(orders)
          .set({
            status: 'EXPIRED',
            cancellationReason: 'Restaurant did not accept order within 3 minutes',
            updatedAt: now,
          })
          .where(eq(orders.id, order.id));

        await tx.insert(orderEvents).values({
          id: generateUUIDv7(),
          orderId: order.id,
          fromStatus: 'PLACED',
          toStatus: 'EXPIRED',
          actorRole: 'SYSTEM',
          payload: { note: 'Auto-expired after 3 minutes' },
          createdAt: now,
        });

        await tx.insert(outboxEvents).values({
          id: generateUUIDv7(),
          aggregateType: 'ORDER',
          aggregateId: order.id,
          eventType: 'order.expired',
          payload: {
            orderId: order.id,
            restaurantId: order.restaurantId,
            orderNumber: order.orderNumber,
            refunded: Boolean(refundRow),
          },
          createdAt: now,
        });

        if (refundRow) {
          await tx.insert(refunds).values(refundRow);
        }
      });

      expiredCount++;
    }

    return expiredCount;
  }
}

export const restaurantOrdersService = new RestaurantOrdersService();
