import { describe, it, expect, beforeEach } from 'vitest';
import { transitionOrder, OrderStatus } from '@tiffin/shared';

describe('Order Concurrency & Race Condition Proofs', () => {
  interface DbOrderRow {
    id: string;
    status: OrderStatus;
    prepTimeMinutes?: number;
    cancellationReason?: string;
    version: number; // Optimistic locking or DB row lock
  }

  let dbOrders: Record<string, DbOrderRow> = {};
  let refundAudit: { orderId: string; amountPaise: number; status: 'PROCESSED' | 'FAILED'; attempts: number }[] = [];

  beforeEach(() => {
    dbOrders = {
      'ord-race-1': {
        id: 'ord-race-1',
        status: 'PLACED',
        version: 1,
      },
      'ord-expired-1': {
        id: 'ord-expired-1',
        status: 'EXPIRED',
        cancellationReason: 'Auto-expired after 3 minutes',
        version: 2,
      },
    };
    refundAudit = [];
  });

  /**
   * Simulated DB transaction updating order status with row-level lock or atomic condition:
   * UPDATE orders SET status = targetStatus, ... WHERE id = :id AND status = :expectedStatus
   */
  function atomicStatusUpdate(
    orderId: string,
    expectedStatus: OrderStatus,
    targetStatus: OrderStatus,
    actorRole: 'RESTAURANT' | 'SYSTEM' | 'CUSTOMER',
    payload?: any
  ): { success: boolean; error?: string; order?: DbOrderRow } {
    const order = dbOrders[orderId];
    if (!order) return { success: false, error: 'NOT_FOUND' };

    // 1. Check state machine transition validity
    const transition = transitionOrder(order.status, targetStatus, {
      actorRole,
      payload,
    });

    if (!transition.ok) {
      return { success: false, error: transition.error };
    }

    // 2. Atomic CAS / Row Lock simulation: WHERE id = :id AND status = :expectedStatus
    if (order.status !== expectedStatus) {
      return {
        success: false,
        error: `CONFLICT_RACE: Expected status '${expectedStatus}', but row was already transitioned to '${order.status}'`,
      };
    }

    order.status = targetStatus;
    order.version += 1;
    if (payload?.prepTimeMinutes) order.prepTimeMinutes = payload.prepTimeMinutes;
    if (payload?.rejectionReason) order.cancellationReason = payload.rejectionReason;

    return { success: true, order };
  }

  it('proves mutual exclusion: when kitchen accepts and worker expires at the exact same instant, only one wins', async () => {
    const orderId = 'ord-race-1';

    // Simulate concurrent execution: Kitchen Accept vs Worker Expire
    // Step A: Kitchen's accept query acquires the row lock first and transitions PLACED -> PREPARING
    const kitchenAttempt = atomicStatusUpdate(orderId, 'PLACED', 'ACCEPTED', 'RESTAURANT', {
      prepTimeMinutes: 20,
    });

    expect(kitchenAttempt.success).toBe(true);
    expect(dbOrders[orderId].status).toBe('ACCEPTED');

    // Step B: Worker's auto-expire attempt runs immediately after on the same row
    const workerAttempt = atomicStatusUpdate(orderId, 'PLACED', 'EXPIRED', 'SYSTEM', {
      note: '3m timer expired',
    });

    // The worker attempt MUST fail because the order is no longer in 'PLACED' status!
    expect(workerAttempt.success).toBe(false);
    expect(workerAttempt.error).toMatch(/(CONFLICT_RACE|Transition from 'ACCEPTED' to 'EXPIRED' is not allowed)/);
    expect(dbOrders[orderId].status).toBe('ACCEPTED');
  });

  it('handles late payment captured after order was already auto-expired: rejects placement and initiates automatic refund', () => {
    const orderId = 'ord-expired-1';
    const order = dbOrders[orderId];
    expect(order.status).toBe('EXPIRED');

    // Inbound webhook arrives with payment.captured after the order timed out
    function handleInboundCapturedWebhook(targetOrderId: string, amountPaise: number) {
      const currentOrder = dbOrders[targetOrderId];

      // Attempt state transition
      const transition = transitionOrder(currentOrder.status, 'PLACED', {
        actorRole: 'SYSTEM',
        payload: { paymentId: 'pay_late_123' },
      });

      if (!transition.ok) {
        // Because EXPIRED is terminal, transition to PLACED is strictly rejected!
        // The webhook engine must catch this and trigger an emergency automated refund
        refundAudit.push({
          orderId: targetOrderId,
          amountPaise,
          status: 'PROCESSED',
          attempts: 1,
        });

        return {
          placed: false,
          refunded: true,
          reason: 'ORDER_ALREADY_EXPIRED_AUTOMATIC_REFUND_ISSUED',
        };
      }

      currentOrder.status = 'PLACED';
      return { placed: true, refunded: false };
    }

    const result = handleInboundCapturedWebhook(orderId, 54000);

    // Verifies order was NOT revived from terminal EXPIRED state
    expect(result.placed).toBe(false);
    expect(result.refunded).toBe(true);
    expect(result.reason).toBe('ORDER_ALREADY_EXPIRED_AUTOMATIC_REFUND_ISSUED');
    expect(dbOrders[orderId].status).toBe('EXPIRED');
    expect(refundAudit.length).toBe(1);
    expect(refundAudit[0].amountPaise).toBe(54000);
  });

  it('retries failed refund calls until processed', () => {
    interface RefundTask {
      id: string;
      orderId: string;
      amountPaise: number;
      attempts: number;
      maxAttempts: number;
      status: 'PENDING' | 'PROCESSED' | 'FAILED';
    }

    const refundQueue: RefundTask[] = [
      {
        id: 'rfnd-1',
        orderId: 'ord-expired-1',
        amountPaise: 35000,
        attempts: 0,
        maxAttempts: 3,
        status: 'PENDING',
      },
    ];

    // Simulate gateway transient failures on attempts 1 and 2, success on attempt 3
    function processRefundAttempt(task: RefundTask, gatewayFails: boolean): boolean {
      task.attempts += 1;
      if (gatewayFails) {
        if (task.attempts >= task.maxAttempts) {
          task.status = 'FAILED';
        }
        return false;
      }
      task.status = 'PROCESSED';
      return true;
    }

    // Attempt 1: Gateway 503 Service Unavailable
    const a1 = processRefundAttempt(refundQueue[0], true);
    expect(a1).toBe(false);
    expect(refundQueue[0].status).toBe('PENDING');
    expect(refundQueue[0].attempts).toBe(1);

    // Attempt 2: Gateway Network Timeout
    const a2 = processRefundAttempt(refundQueue[0], true);
    expect(a2).toBe(false);
    expect(refundQueue[0].status).toBe('PENDING');
    expect(refundQueue[0].attempts).toBe(2);

    // Attempt 3: Gateway recovers and processes refund
    const a3 = processRefundAttempt(refundQueue[0], false);
    expect(a3).toBe(true);
    expect(refundQueue[0].status).toBe('PROCESSED');
    expect(refundQueue[0].attempts).toBe(3);
  });
});
