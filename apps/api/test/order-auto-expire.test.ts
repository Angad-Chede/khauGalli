import { describe, it, expect } from 'vitest';
import { transitionOrder } from '@tiffin/shared';

describe('Order Auto-Expiration Engine (3-Minute Window)', () => {
  interface SimOrder {
    id: string;
    status: string;
    placedAt: Date;
    paymentMode: 'ONLINE' | 'COD';
    grandTotalPaise: number;
    refunded?: boolean;
  }

  function runAutoExpireSweep(orders: SimOrder[], maxAgeSeconds: number = 180) {
    const now = Date.now();
    let expiredCount = 0;

    for (const order of orders) {
      if (order.status !== 'PLACED') continue;

      const elapsedSeconds = (now - order.placedAt.getTime()) / 1000;
      if (elapsedSeconds >= maxAgeSeconds) {
        // Transition order using shared state machine
        const transition = transitionOrder(order.status as any, 'EXPIRED', {
          actorRole: 'SYSTEM',
          payload: { note: 'Auto-expired after 3-minute kitchen acceptance window' },
        });

        if (transition.ok) {
          order.status = 'EXPIRED';
          if (order.paymentMode === 'ONLINE') {
            order.refunded = true; // Triggers refund
          }
          expiredCount++;
        }
      }
    }

    return expiredCount;
  }

  it('auto-expires order placed 181 seconds ago and marks online payment for refund', () => {
    const orders: SimOrder[] = [
      {
        id: 'ord-stale-online',
        status: 'PLACED',
        placedAt: new Date(Date.now() - 181 * 1000), // 3 mins 1 sec ago
        paymentMode: 'ONLINE',
        grandTotalPaise: 35000,
      },
      {
        id: 'ord-fresh-online',
        status: 'PLACED',
        placedAt: new Date(Date.now() - 45 * 1000), // 45 seconds ago
        paymentMode: 'ONLINE',
        grandTotalPaise: 42000,
      },
      {
        id: 'ord-cooking',
        status: 'PREPARING',
        placedAt: new Date(Date.now() - 600 * 1000), // 10 mins ago, but kitchen accepted it!
        paymentMode: 'ONLINE',
        grandTotalPaise: 25000,
      },
    ];

    const expiredCount = runAutoExpireSweep(orders, 180);

    expect(expiredCount).toBe(1);

    // Stale order is expired and refunded
    expect(orders[0].status).toBe('EXPIRED');
    expect(orders[0].refunded).toBe(true);

    // Fresh order remains PLACED with 0 refunds
    expect(orders[1].status).toBe('PLACED');
    expect(orders[1].refunded).toBeUndefined();

    // Already cooking order remains PREPARING
    expect(orders[2].status).toBe('PREPARING');
  });

  it('handles COD stale orders by expiring them without issuing online refunds', () => {
    const orders: SimOrder[] = [
      {
        id: 'ord-stale-cod',
        status: 'PLACED',
        placedAt: new Date(Date.now() - 200 * 1000),
        paymentMode: 'COD',
        grandTotalPaise: 20000,
      },
    ];

    const count = runAutoExpireSweep(orders, 180);
    expect(count).toBe(1);
    expect(orders[0].status).toBe('EXPIRED');
    expect(orders[0].refunded).toBeUndefined();
  });
});
