import { db, payments, webhookEvents, orders, orderEvents, outboxEvents } from '@tiffin/db';
import { eq, and } from 'drizzle-orm';
import { generateUUIDv7, transitionOrder, OrderStatus } from '@tiffin/shared';
import { verifyRazorpayWebhookSignature } from '../../lib/razorpay';

export interface WebhookProcessingResult {
  processed: boolean;
  reason?: string;
  eventId?: string;
  eventType?: string;
  orderId?: string;
}

export class WebhookService {
  /**
   * Process Razorpay inbound webhook with raw signature check, deduplication, and out-of-order protection.
   */
  async processWebhook(
    rawBody: string,
    signature: string,
    payload: any,
    eventIdHeader?: string
  ): Promise<WebhookProcessingResult> {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_webhook_secret_key';

    // 1. Raw Body Signature Verification
    const isSignatureValid = verifyRazorpayWebhookSignature(rawBody, signature, webhookSecret);
    if (!isSignatureValid) {
      const err: any = new Error('Invalid Razorpay webhook signature');
      err.statusCode = 400;
      err.code = 'INVALID_SIGNATURE';
      throw err;
    }

    if (!payload || !payload.event) {
      const err: any = new Error('Invalid webhook payload structure');
      err.statusCode = 400;
      err.code = 'INVALID_PAYLOAD';
      throw err;
    }

    const eventType = payload.event as string;
    const paymentEntity = payload.payload?.payment?.entity;
    const rzpPaymentId = paymentEntity?.id;
    const rzpOrderId = paymentEntity?.order_id;

    // Determine deterministic unique event identifier
    const eventId =
      eventIdHeader ||
      payload.id ||
      (rzpPaymentId ? `${eventType}:${rzpPaymentId}` : `${eventType}:${Date.now()}`);

    // 2. Webhook Event Deduplication Check
    try {
      const existingEvent = await db.query.webhookEvents.findFirst({
        where: and(
          eq(webhookEvents.provider, 'RAZORPAY'),
          eq(webhookEvents.providerEventId, eventId)
        ),
      });

      if (existingEvent) {
        return {
          processed: false,
          reason: 'DUPLICATE_EVENT',
          eventId,
          eventType,
        };
      }
    } catch {
      // In isolated testing without active DB
    }

    // 3. Handle specific event types
    const now = new Date();

    if (eventType === 'payment.captured') {
      if (!rzpOrderId && !rzpPaymentId) {
        return { processed: false, reason: 'MISSING_PAYMENT_ENTITY', eventId };
      }

      // Find the associated payment record
      let paymentRecord = await db.query.payments.findFirst({
        where: rzpOrderId
          ? eq(payments.razorpayOrderId, rzpOrderId)
          : eq(payments.razorpayPaymentId, rzpPaymentId),
      });

      // If not found by rzpOrderId, try matching by notes
      if (!paymentRecord && paymentEntity?.notes?.orderId) {
        paymentRecord = await db.query.payments.findFirst({
          where: eq(payments.orderId, paymentEntity.notes.orderId),
        });
      }

      if (!paymentRecord) {
        return { processed: false, reason: 'PAYMENT_RECORD_NOT_FOUND', eventId };
      }

      // Out-of-order idempotency protection: If already captured, don't re-run
      if (paymentRecord.status === 'CAPTURED') {
        return {
          processed: true,
          reason: 'ALREADY_CAPTURED',
          eventId,
          orderId: paymentRecord.orderId,
        };
      }

      const order = await db.query.orders.findFirst({
        where: eq(orders.id, paymentRecord.orderId),
      });

      if (!order) {
        return { processed: false, reason: 'ORDER_NOT_FOUND', eventId };
      }

      // Validate state transition (PAYMENT_PENDING -> PLACED)
      const transitionResult = transitionOrder(order.status as OrderStatus, 'PLACED', {
        actorRole: 'SYSTEM',
        payload: { paymentId: rzpPaymentId, rzpOrderId },
      });

      // Execute DB Transaction
      await db.transaction(async (tx) => {
        // Record processed webhook event for deduplication
        await tx.insert(webhookEvents).values({
          id: generateUUIDv7(),
          provider: 'RAZORPAY',
          providerEventId: eventId,
          eventType,
          processedAt: now,
        });

        // Update Payment record
        await tx
          .update(payments)
          .set({
            status: 'CAPTURED',
            razorpayPaymentId: rzpPaymentId,
            rawWebhookPayload: payload,
            updatedAt: now,
          })
          .where(eq(payments.id, paymentRecord.id));

        // If order state transition is permitted, update Order
        if (transitionResult.ok) {
          await tx
            .update(orders)
            .set({
              status: 'PLACED',
              placedAt: now,
              updatedAt: now,
            })
            .where(eq(orders.id, order.id));

          // Record Order Event
          await tx.insert(orderEvents).values({
            id: generateUUIDv7(),
            orderId: order.id,
            fromStatus: order.status,
            toStatus: 'PLACED',
            actorRole: 'SYSTEM',
            payload: { razorpayPaymentId: rzpPaymentId },
            createdAt: now,
          });

          // Record Transactional Outbox Event
          await tx.insert(outboxEvents).values({
            id: generateUUIDv7(),
            aggregateType: 'ORDER',
            aggregateId: order.id,
            eventType: 'order.placed',
            payload: {
              orderId: order.id,
              restaurantId: order.restaurantId,
              orderNumber: order.orderNumber,
              grandTotalPaise: order.grandTotalPaise,
              paymentId: rzpPaymentId,
            },
            createdAt: now,
          });
        }
      });

      return {
        processed: true,
        eventId,
        eventType,
        orderId: order.id,
      };
    }

    if (eventType === 'payment.authorized') {
      // Find payment record
      const paymentRecord = await db.query.payments.findFirst({
        where: rzpOrderId
          ? eq(payments.razorpayOrderId, rzpOrderId)
          : eq(payments.razorpayPaymentId, rzpPaymentId),
      });

      if (!paymentRecord) {
        return { processed: false, reason: 'PAYMENT_RECORD_NOT_FOUND', eventId };
      }

      // OUT-OF-ORDER PROTECTION: If already CAPTURED, DO NOT downgrade to AUTHORIZED!
      if (paymentRecord.status === 'CAPTURED') {
        return {
          processed: true,
          reason: 'IGNORED_OUT_OF_ORDER_ALREADY_CAPTURED',
          eventId,
          orderId: paymentRecord.orderId,
        };
      }

      await db.transaction(async (tx) => {
        await tx.insert(webhookEvents).values({
          id: generateUUIDv7(),
          provider: 'RAZORPAY',
          providerEventId: eventId,
          eventType,
          processedAt: now,
        });

        await tx
          .update(payments)
          .set({
            status: 'AUTHORIZED',
            razorpayPaymentId: rzpPaymentId,
            updatedAt: now,
          })
          .where(eq(payments.id, paymentRecord.id));
      });

      return {
        processed: true,
        eventId,
        eventType,
        orderId: paymentRecord.orderId,
      };
    }

    if (eventType === 'payment.failed') {
      const paymentRecord = await db.query.payments.findFirst({
        where: rzpOrderId
          ? eq(payments.razorpayOrderId, rzpOrderId)
          : eq(payments.razorpayPaymentId, rzpPaymentId),
      });

      if (!paymentRecord) {
        return { processed: false, reason: 'PAYMENT_RECORD_NOT_FOUND', eventId };
      }

      // If already captured, don't fail
      if (paymentRecord.status === 'CAPTURED') {
        return { processed: true, reason: 'ALREADY_CAPTURED', eventId };
      }

      const order = await db.query.orders.findFirst({
        where: eq(orders.id, paymentRecord.orderId),
      });

      const errorCode = paymentEntity?.error_code || 'PAYMENT_FAILED';
      const errorDescription = paymentEntity?.error_description || 'Payment was declined by gateway';

      await db.transaction(async (tx) => {
        await tx.insert(webhookEvents).values({
          id: generateUUIDv7(),
          provider: 'RAZORPAY',
          providerEventId: eventId,
          eventType,
          processedAt: now,
        });

        await tx
          .update(payments)
          .set({
            status: 'FAILED',
            errorCode,
            errorDescription,
            updatedAt: now,
          })
          .where(eq(payments.id, paymentRecord.id));

        if (order && order.status === 'PAYMENT_PENDING') {
          await tx
            .update(orders)
            .set({
              status: 'PAYMENT_FAILED',
              cancellationReason: errorDescription,
              updatedAt: now,
            })
            .where(eq(orders.id, order.id));

          await tx.insert(orderEvents).values({
            id: generateUUIDv7(),
            orderId: order.id,
            fromStatus: order.status,
            toStatus: 'PAYMENT_FAILED',
            actorRole: 'SYSTEM',
            payload: { errorCode, errorDescription },
            createdAt: now,
          });

          await tx.insert(outboxEvents).values({
            id: generateUUIDv7(),
            aggregateType: 'ORDER',
            aggregateId: order.id,
            eventType: 'order.payment_failed',
            payload: {
              orderId: order.id,
              orderNumber: order.orderNumber,
              errorCode,
              errorDescription,
            },
            createdAt: now,
          });
        }
      });

      return {
        processed: true,
        eventId,
        eventType,
        orderId: paymentRecord.orderId,
      };
    }

    // Default acknowledgment for unhandled webhook types
    return {
      processed: true,
      reason: 'UNHANDLED_EVENT_TYPE_ACKNOWLEDGED',
      eventId,
      eventType,
    };
  }
}

export const webhookService = new WebhookService();
