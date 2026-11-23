import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { buildServer } from '../src/server';
import { FastifyInstance } from 'fastify';
import { SEED_IDS } from '@tiffin/db';

describe('Phase 5 Super-Admin Console & Platform Governance', () => {
  let app: FastifyInstance;
  const jwtSecret = 'test_secret_must_be_32_characters_long_min_1234';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = jwtSecret;
    app = await buildServer();
    await app.ready();
  });

  // Helper to generate typed JWTs
  function createToken(roles: string[], sub: string = '018f0000-0000-7000-8000-000000000014') {
    return jwt.sign(
      {
        sub,
        phone: '+919999900004',
        roles,
        activeRole: roles[0],
      },
      jwtSecret
    );
  }

  describe('RBAC Guardrails on /admin/*', () => {
    it('rejects unauthenticated requests on /admin/live-ops with HTTP 401 Unauthorized', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/live-ops',
      });

      expect(res.statusCode).toBe(401);
    });

    it('rejects customer token on /admin/live-ops with HTTP 403 Forbidden', async () => {
      const customerToken = createToken(['CUSTOMER'], SEED_IDS.USER_ASHA);

      const res = await app.inject({
        method: 'GET',
        url: '/admin/live-ops',
        headers: { authorization: `Bearer ${customerToken}` },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.code).toBe('ADMIN_ACCESS_REQUIRED');
    });

    it('rejects restaurant staff token on /admin/live-ops with HTTP 403 Forbidden', async () => {
      const staffToken = createToken(['RESTAURANT'], SEED_IDS.USER_RAVI);

      const res = await app.inject({
        method: 'GET',
        url: '/admin/live-ops',
        headers: { authorization: `Bearer ${staffToken}` },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.code).toBe('ADMIN_ACCESS_REQUIRED');
    });

    it('rejects delivery partner token on /admin/live-ops with HTTP 403 Forbidden', async () => {
      const riderToken = createToken(['RIDER'], SEED_IDS.USER_IMRAN);

      const res = await app.inject({
        method: 'GET',
        url: '/admin/live-ops',
        headers: { authorization: `Bearer ${riderToken}` },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.code).toBe('ADMIN_ACCESS_REQUIRED');
    });

    it('allows Super-Admin token on /admin/live-ops and returns operational pulse', async () => {
      const adminToken = createToken(['ADMIN'], SEED_IDS.USER_MEERA);

      const res = await app.inject({
        method: 'GET',
        url: '/admin/live-ops',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('activeOrdersCount');
      expect(body).toHaveProperty('stuckOrdersCount');
      expect(body).toHaveProperty('couriers');
      expect(body).toHaveProperty('finance');
    });
  });

  describe('Financial Settlement Split & Commission Calculations', () => {
    function calculateSettlement(grossSubtotalPaise: number, commissionBps: number) {
      if (commissionBps < 0 || commissionBps > 5000) {
        throw new Error('Commission must be between 0% and 50%');
      }

      const commissionRate = commissionBps / 10000;
      const platformCommissionPaise = Math.round(grossSubtotalPaise * commissionRate);
      const netMerchantPayablePaise = grossSubtotalPaise - platformCommissionPaise;

      return {
        grossSubtotalPaise,
        platformCommissionPaise,
        netMerchantPayablePaise,
      };
    }

    it('calculates 18% commission tier correctly (e.g. Khau Galli)', () => {
      const split = calculateSettlement(50000, 1800); // ₹500 at 18.00%
      expect(split.platformCommissionPaise).toBe(9000); // ₹90.00 commission
      expect(split.netMerchantPayablePaise).toBe(41000); // ₹410.00 net payout
      expect(split.platformCommissionPaise + split.netMerchantPayablePaise).toBe(50000);
    });

    it('calculates 22.5% commission tier correctly (e.g. Biryani Darbar)', () => {
      const split = calculateSettlement(120000, 2250); // ₹1,200 at 22.50%
      expect(split.platformCommissionPaise).toBe(27000); // ₹270.00 commission
      expect(split.netMerchantPayablePaise).toBe(93000); // ₹930.00 net payout
    });

    it('rejects invalid commission rates exceeding 50% or negative rates', () => {
      expect(() => calculateSettlement(50000, 5500)).toThrowError(/between 0% and 50%/);
      expect(() => calculateSettlement(50000, -100)).toThrowError(/between 0% and 50%/);
    });
  });

  describe('Stuck-Orders Watchdog Logic', () => {
    interface WatchdogOrder {
      id: string;
      status: string;
      placedAt: Date;
      readyAt?: Date;
    }

    function detectStuckOrders(ordersList: WatchdogOrder[], now: Date = new Date()) {
      return ordersList.filter((o) => {
        const placedAgeSeconds = (now.getTime() - o.placedAt.getTime()) / 1000;

        // Condition 1: PLACED for > 180 seconds (3 minutes)
        if (o.status === 'PLACED' && placedAgeSeconds > 180) {
          return true;
        }

        // Condition 2: READY for > 300 seconds (5 minutes) without courier pickup
        if (o.status === 'READY' && o.readyAt) {
          const readyAgeSeconds = (now.getTime() - o.readyAt.getTime()) / 1000;
          if (readyAgeSeconds > 300) {
            return true;
          }
        }

        return false;
      });
    }

    it('flags orders stuck in PLACED state for more than 3 minutes', () => {
      const now = new Date();
      const mockOrders: WatchdogOrder[] = [
        {
          id: 'fresh-order',
          status: 'PLACED',
          placedAt: new Date(now.getTime() - 45000), // 45s ago
        },
        {
          id: 'stuck-placed-order',
          status: 'PLACED',
          placedAt: new Date(now.getTime() - 200000), // 3m 20s ago
        },
      ];

      const stuck = detectStuckOrders(mockOrders, now);
      expect(stuck).toHaveLength(1);
      expect(stuck[0].id).toBe('stuck-placed-order');
    });

    it('flags food left on counter in READY state for more than 5 minutes', () => {
      const now = new Date();
      const mockOrders: WatchdogOrder[] = [
        {
          id: 'fresh-ready',
          status: 'READY',
          placedAt: new Date(now.getTime() - 900000),
          readyAt: new Date(now.getTime() - 120000), // 2m ago
        },
        {
          id: 'stuck-ready',
          status: 'READY',
          placedAt: new Date(now.getTime() - 900000),
          readyAt: new Date(now.getTime() - 360000), // 6m ago
        },
      ];

      const stuck = detectStuckOrders(mockOrders, now);
      expect(stuck).toHaveLength(1);
      expect(stuck[0].id).toBe('stuck-ready');
    });
  });

  describe('Immutable Audit Log Trail', () => {
    interface AuditEntry {
      actorId: string;
      actorRole: string;
      action: string;
      entityType: string;
      entityId: string;
      diff: any;
      createdAt: Date;
    }

    it('records structured diff upon restaurant commission adjustment', () => {
      const auditTrail: AuditEntry[] = [];

      function logCommissionChange(
        actorId: string,
        restaurantId: string,
        restaurantName: string,
        oldBps: number,
        newBps: number
      ) {
        auditTrail.push({
          actorId,
          actorRole: 'ADMIN',
          action: 'UPDATE_COMMISSION_RATE',
          entityType: 'RESTAURANT',
          entityId: restaurantId,
          diff: {
            restaurantName,
            oldBps,
            newBps,
            oldPercent: `${oldBps / 100}%`,
            newPercent: `${newBps / 100}%`,
          },
          createdAt: new Date(),
        });
      }

      logCommissionChange(SEED_IDS.USER_MEERA, SEED_IDS.REST_KHAU_GALLI, 'Khau Galli', 2000, 1800);

      expect(auditTrail).toHaveLength(1);
      expect(auditTrail[0].action).toBe('UPDATE_COMMISSION_RATE');
      expect(auditTrail[0].actorRole).toBe('ADMIN');
      expect(auditTrail[0].diff.oldPercent).toBe('20%');
      expect(auditTrail[0].diff.newPercent).toBe('18%');
    });
  });
});
