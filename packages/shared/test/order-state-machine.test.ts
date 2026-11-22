import { describe, it, expect } from 'vitest';
import {
  transitionOrder,
  ORDER_STATUSES,
  TERMINAL_ORDER_STATUSES,
  OrderStatus,
} from '../src/state-machine';

describe('Order State Machine Engine', () => {
  it('allows full happy path lifecycle for online paid order', () => {
    // 1. Customer creates order -> PAYMENT_PENDING
    const t1 = transitionOrder('CREATED', 'PAYMENT_PENDING', {
      actorRole: 'CUSTOMER',
      actorId: 'user-1',
    });
    expect(t1.ok).toBe(true);
    if (!t1.ok) return;
    expect(t1.toStatus).toBe('PAYMENT_PENDING');

    // 2. Webhook triggers PLACED upon payment capture
    const t2 = transitionOrder('PAYMENT_PENDING', 'PLACED', {
      actorRole: 'SYSTEM',
    });
    expect(t2.ok).toBe(true);

    // 3. Restaurant accepts order with 25 minutes prep time
    const t3 = transitionOrder('PLACED', 'ACCEPTED', {
      actorRole: 'RESTAURANT',
      actorId: 'chef-1',
      payload: { prepTimeMinutes: 25 },
    });
    expect(t3.ok).toBe(true);

    // 4. Restaurant moves to PREPARING
    const t4 = transitionOrder('ACCEPTED', 'PREPARING', {
      actorRole: 'RESTAURANT',
      actorId: 'chef-1',
    });
    expect(t4.ok).toBe(true);

    // 5. Food is READY
    const t5 = transitionOrder('PREPARING', 'READY', {
      actorRole: 'RESTAURANT',
      actorId: 'chef-1',
    });
    expect(t5.ok).toBe(true);

    // 6. Rider picks up
    const t6 = transitionOrder('READY', 'PICKED_UP', {
      actorRole: 'RIDER',
      actorId: 'rider-1',
    });
    expect(t6.ok).toBe(true);

    // 7. Rider delivers
    const t7 = transitionOrder('PICKED_UP', 'DELIVERED', {
      actorRole: 'RIDER',
      actorId: 'rider-1',
    });
    expect(t7.ok).toBe(true);
    expect(t7.toStatus).toBe('DELIVERED');
  });

  it('allows direct transition from CREATED to PLACED for Cash on Delivery (COD)', () => {
    const result = transitionOrder('CREATED', 'PLACED', {
      actorRole: 'CUSTOMER',
      actorId: 'user-1',
    });
    expect(result.ok).toBe(true);
    expect(result.toStatus).toBe('PLACED');
  });

  it('rejects identical state transition', () => {
    const result = transitionOrder('PLACED', 'PLACED', {
      actorRole: 'RESTAURANT',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('ILLEGAL_TRANSITION');
  });

  it('strictly rejects any transition out of terminal states', () => {
    for (const terminalStatus of TERMINAL_ORDER_STATUSES) {
      for (const targetStatus of ORDER_STATUSES) {
        const result = transitionOrder(terminalStatus, targetStatus, {
          actorRole: 'ADMIN',
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(['TERMINAL_STATE', 'ILLEGAL_TRANSITION']).toContain(result.code);
      }
    }
  });

  it('rejects illegal status jumps (e.g., CREATED directly to READY)', () => {
    const result = transitionOrder('CREATED', 'READY', {
      actorRole: 'ADMIN',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('ILLEGAL_TRANSITION');
  });

  it('enforces actor role authorization strictly', () => {
    // Customer cannot accept order
    const r1 = transitionOrder('PLACED', 'ACCEPTED', {
      actorRole: 'CUSTOMER',
      payload: { prepTimeMinutes: 15 },
    });
    expect(r1.ok).toBe(false);
    if (r1.ok) return;
    expect(r1.code).toBe('UNAUTHORIZED_ACTOR');

    // Restaurant cannot deliver order
    const r2 = transitionOrder('PICKED_UP', 'DELIVERED', {
      actorRole: 'RESTAURANT',
    });
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.code).toBe('UNAUTHORIZED_ACTOR');
  });

  it('validates required payload for REJECTED_BY_RESTAURANT', () => {
    // Missing reason
    const failRes = transitionOrder('PLACED', 'REJECTED_BY_RESTAURANT', {
      actorRole: 'RESTAURANT',
      actorId: 'chef-1',
      payload: {},
    });
    expect(failRes.ok).toBe(false);
    if (failRes.ok) return;
    expect(failRes.code).toBe('MISSING_PAYLOAD');

    // With reason
    const successRes = transitionOrder('PLACED', 'REJECTED_BY_RESTAURANT', {
      actorRole: 'RESTAURANT',
      actorId: 'chef-1',
      payload: { rejectionReason: 'Kitchen overloaded with dinner rush' },
    });
    expect(successRes.ok).toBe(true);
  });

  it('validates prepTimeMinutes on ACCEPTED if provided', () => {
    const invalidRes = transitionOrder('PLACED', 'ACCEPTED', {
      actorRole: 'RESTAURANT',
      payload: { prepTimeMinutes: -5 },
    });
    expect(invalidRes.ok).toBe(false);
    if (invalidRes.ok) return;
    expect(invalidRes.code).toBe('MISSING_PAYLOAD');
  });

  it('allows auto-expiration timer to mark order EXPIRED from PLACED', () => {
    const result = transitionOrder('PLACED', 'EXPIRED', {
      actorRole: 'SYSTEM',
      payload: { note: '3-minute acceptance window expired' },
    });
    expect(result.ok).toBe(true);
    expect(result.toStatus).toBe('EXPIRED');
  });

  it('allows customer cancellation before order is accepted by restaurant', () => {
    const result = transitionOrder('PLACED', 'CANCELLED', {
      actorRole: 'CUSTOMER',
      actorId: 'user-1',
      payload: { cancellationReason: 'Changed my mind' },
    });
    expect(result.ok).toBe(true);
    expect(result.toStatus).toBe('CANCELLED');
  });

  it('rejects customer cancellation once cooking has started (PREPARING)', () => {
    const result = transitionOrder('PREPARING', 'CANCELLED', {
      actorRole: 'CUSTOMER',
      actorId: 'user-1',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('UNAUTHORIZED_ACTOR');
  });
});
