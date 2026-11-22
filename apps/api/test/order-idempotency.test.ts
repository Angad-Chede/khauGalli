import { describe, it, expect, beforeEach } from 'vitest';

describe('Order Idempotency Guardrails', () => {
  interface OrderRecord {
    id: string;
    userId: string;
    idempotencyKey: string;
    orderNumber: string;
    grandTotalPaise: number;
    status: string;
  }

  let ordersDb: OrderRecord[] = [];

  beforeEach(() => {
    ordersDb = [];
  });

  function placeOrderSim(
    userId: string,
    idempotencyKey: string | undefined,
    grandTotalPaise: number
  ) {
    if (!idempotencyKey || !idempotencyKey.trim()) {
      return { status: 400, error: 'MISSING_IDEMPOTENCY_KEY' };
    }

    // Check unique (user_id, idempotency_key) index
    const existing = ordersDb.find(
      (o) => o.userId === userId && o.idempotencyKey === idempotencyKey
    );

    if (existing) {
      return {
        status: 200,
        isReplay: true,
        order: existing,
      };
    }

    const newOrder: OrderRecord = {
      id: `ord_${Date.now()}_${Math.random()}`,
      userId,
      idempotencyKey,
      orderNumber: `ORD-${Date.now()}`,
      grandTotalPaise,
      status: 'PLACED',
    };

    ordersDb.push(newOrder);

    return {
      status: 201,
      isReplay: false,
      order: newOrder,
    };
  }

  it('rejects order placement when Idempotency-Key header is omitted', () => {
    const res = placeOrderSim('user-1', undefined, 45000);
    expect(res.status).toBe(400);
    expect(res.error).toBe('MISSING_IDEMPOTENCY_KEY');
    expect(ordersDb.length).toBe(0);
  });

  it('creates order on first request and safely returns existing order on subsequent retries with identical key', () => {
    const idempotencyKey = 'client-uuid-test-key-12345';

    // 1st Attempt: Creates order
    const r1 = placeOrderSim('user-1', idempotencyKey, 45000);
    expect(r1.status).toBe(201);
    expect(r1.isReplay).toBe(false);
    expect(ordersDb.length).toBe(1);
    const createdOrderId = r1.order!.id;

    // 2nd through 10th Attempt: Network timeout retry or double-click by user
    for (let i = 2; i <= 10; i++) {
      const retryRes = placeOrderSim('user-1', idempotencyKey, 45000);
      expect(retryRes.status).toBe(200);
      expect(retryRes.isReplay).toBe(true);
      expect(retryRes.order!.id).toBe(createdOrderId);
    }

    // Exactly 1 row in DB! Zero duplicates.
    expect(ordersDb.length).toBe(1);
  });

  it('allows distinct orders when different idempotency keys are used', () => {
    const r1 = placeOrderSim('user-1', 'key-order-1', 25000);
    const r2 = placeOrderSim('user-1', 'key-order-2', 35000);

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(ordersDb.length).toBe(2);
    expect(r1.order!.id).not.toBe(r2.order!.id);
  });
});
