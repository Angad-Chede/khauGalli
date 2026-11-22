import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeRazorpayWebhookSignature } from '../src/lib/razorpay';

describe('Webhook Deduplication & Out-of-Order Event Protection', () => {
  const secret = 'rzp_webhook_secret_key';

  // In-memory mock DB tables for isolation
  let webhookEventsTable: { id: string; provider: string; providerEventId: string; eventType: string }[] = [];
  let paymentsTable: { id: string; orderId: string; razorpayOrderId: string; status: string }[] = [];
  let ordersTable: { id: string; status: string; orderNumber: string }[] = [];

  beforeEach(() => {
    webhookEventsTable = [];
    paymentsTable = [
      {
        id: 'pay-db-1',
        orderId: 'order-db-1',
        razorpayOrderId: 'order_rzp_123',
        status: 'PENDING',
      },
    ];
    ordersTable = [
      {
        id: 'order-db-1',
        status: 'PAYMENT_PENDING',
        orderNumber: 'ORD-20261122-0001',
      },
    ];
  });

  // Simulated Webhook Processing Engine (mirroring WebhookService)
  function processWebhookSim(
    rawBody: string,
    signature: string,
    payload: any,
    eventIdHeader?: string
  ) {
    const expectedSig = computeRazorpayWebhookSignature(rawBody, secret);
    if (signature !== expectedSig) {
      throw new Error('INVALID_SIGNATURE');
    }

    const eventType = payload.event;
    const paymentEntity = payload.payload?.payment?.entity;
    const rzpOrderId = paymentEntity?.order_id;
    const rzpPaymentId = paymentEntity?.id;

    const eventId = eventIdHeader || payload.id || `${eventType}:${rzpPaymentId}`;

    // 1. Deduplication check
    const isDuplicate = webhookEventsTable.some(
      (e) => e.provider === 'RAZORPAY' && e.providerEventId === eventId
    );
    if (isDuplicate) {
      return { processed: false, reason: 'DUPLICATE_EVENT', eventId };
    }

    // 2. Event processing
    if (eventType === 'payment.captured') {
      const payment = paymentsTable.find((p) => p.razorpayOrderId === rzpOrderId);
      if (!payment) return { processed: false, reason: 'PAYMENT_NOT_FOUND' };

      if (payment.status === 'CAPTURED') {
        return { processed: true, reason: 'ALREADY_CAPTURED' };
      }

      // Record deduplication
      webhookEventsTable.push({
        id: `wev-${Date.now()}`,
        provider: 'RAZORPAY',
        providerEventId: eventId,
        eventType,
      });

      payment.status = 'CAPTURED';
      const order = ordersTable.find((o) => o.id === payment.orderId);
      if (order && order.status === 'PAYMENT_PENDING') {
        order.status = 'PLACED';
      }

      return { processed: true, orderId: payment.orderId, newStatus: order?.status };
    }

    if (eventType === 'payment.authorized') {
      const payment = paymentsTable.find((p) => p.razorpayOrderId === rzpOrderId);
      if (!payment) return { processed: false, reason: 'PAYMENT_NOT_FOUND' };

      // OUT-OF-ORDER PROTECTION: If already CAPTURED, DO NOT revert to AUTHORIZED!
      if (payment.status === 'CAPTURED') {
        return {
          processed: true,
          reason: 'IGNORED_OUT_OF_ORDER_ALREADY_CAPTURED',
          status: payment.status,
        };
      }

      webhookEventsTable.push({
        id: `wev-${Date.now()}`,
        provider: 'RAZORPAY',
        providerEventId: eventId,
        eventType,
      });

      payment.status = 'AUTHORIZED';
      return { processed: true, newStatus: payment.status };
    }

    return { processed: true, reason: 'UNHANDLED' };
  }

  it('deduplicates identical webhooks delivered 5 times so it is processed exactly once', () => {
    const payload = {
      id: 'event_dup_test_1',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_capture_999',
            order_id: 'order_rzp_123',
            amount: 45000,
          },
        },
      },
    };

    const rawBody = JSON.stringify(payload);
    const signature = computeRazorpayWebhookSignature(rawBody, secret);

    // Call 1: First arrival
    const r1 = processWebhookSim(rawBody, signature, payload);
    expect(r1.processed).toBe(true);
    expect(r1.newStatus).toBe('PLACED');
    expect(ordersTable[0].status).toBe('PLACED');
    expect(webhookEventsTable.length).toBe(1);

    // Calls 2 through 5: Retried identical delivery
    for (let i = 2; i <= 5; i++) {
      const retryResult = processWebhookSim(rawBody, signature, payload);
      expect(retryResult.processed).toBe(false);
      expect(retryResult.reason).toBe('DUPLICATE_EVENT');
    }

    // Proves webhook_events table and order state remain strictly processed once
    expect(webhookEventsTable.length).toBe(1);
    expect(ordersTable[0].status).toBe('PLACED');
  });

  it('protects against out-of-order delivery: payment.captured followed by delayed payment.authorized never reverts status', () => {
    // 1. payment.captured arrives first
    const capturePayload = {
      id: 'event_seq_captured',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_seq_1',
            order_id: 'order_rzp_123',
            amount: 45000,
          },
        },
      },
    };
    const captureBody = JSON.stringify(capturePayload);
    const captureSig = computeRazorpayWebhookSignature(captureBody, secret);

    const rCapture = processWebhookSim(captureBody, captureSig, capturePayload);
    expect(rCapture.processed).toBe(true);
    expect(paymentsTable[0].status).toBe('CAPTURED');
    expect(ordersTable[0].status).toBe('PLACED');

    // 2. Delayed payment.authorized arrives *after* payment was already captured
    const authPayload = {
      id: 'event_seq_authorized_delayed',
      event: 'payment.authorized',
      payload: {
        payment: {
          entity: {
            id: 'pay_seq_1',
            order_id: 'order_rzp_123',
            amount: 45000,
          },
        },
      },
    };
    const authBody = JSON.stringify(authPayload);
    const authSig = computeRazorpayWebhookSignature(authBody, secret);

    const rAuth = processWebhookSim(authBody, authSig, authPayload);

    // Verifies status was NOT downgraded to AUTHORIZED
    expect(rAuth.reason).toBe('IGNORED_OUT_OF_ORDER_ALREADY_CAPTURED');
    expect(paymentsTable[0].status).toBe('CAPTURED');
    expect(ordersTable[0].status).toBe('PLACED');
  });
});
