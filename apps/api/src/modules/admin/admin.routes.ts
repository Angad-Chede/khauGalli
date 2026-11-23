import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { adminService } from './admin.service';
import { requireAdmin } from '../../middleware/auth.middleware';

const UpdateCommissionSchema = z.object({
  commissionBps: z.number().int().min(0).max(5000), // 0% to 50%
});

const UpdateRestaurantStatusSchema = z.object({
  status: z.enum(['APPROVED', 'SUSPENDED']),
  reason: z.string().max(300).optional(),
});

const ToggleZoneSchema = z.object({
  isActive: z.boolean(),
});

const InterveneOrderSchema = z.object({
  action: z.enum(['CANCEL_AND_REFUND', 'REDISPATCH_COURIER']),
  reason: z.string().min(2).max(300),
});

export const adminRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Enforce strict Super-Admin RBAC on all admin endpoints
  app.addHook('preHandler', requireAdmin);

  // GET /admin/live-ops
  app.get('/live-ops', async (req: FastifyRequest, reply: FastifyReply) => {
    const liveOps = await adminService.getLiveOps();
    return reply.send(liveOps);
  });

  // GET /admin/restaurants
  app.get('/restaurants', async (req: FastifyRequest, reply: FastifyReply) => {
    const restaurantsList = await adminService.listRestaurants();
    return reply.send({ restaurants: restaurantsList });
  });

  // PATCH /admin/restaurants/:id/commission
  app.patch(
    '/restaurants/:id/commission',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const parse = UpdateCommissionSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Commission bps must be an integer between 0 and 5000' });
      }

      const adminId = req.user!.sub;
      const restaurantId = req.params.id;

      try {
        const result = await adminService.updateRestaurantCommission(
          restaurantId,
          parse.data.commissionBps,
          adminId
        );
        return reply.send(result);
      } catch (err: any) {
        return reply.status(err.statusCode || 400).send({ error: err.message });
      }
    }
  );

  // PATCH /admin/restaurants/:id/status
  app.patch(
    '/restaurants/:id/status',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const parse = UpdateRestaurantStatusSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Status must be APPROVED or SUSPENDED' });
      }

      const adminId = req.user!.sub;
      const restaurantId = req.params.id;

      try {
        const result = await adminService.updateRestaurantStatus(
          restaurantId,
          parse.data.status,
          adminId,
          parse.data.reason
        );
        return reply.send(result);
      } catch (err: any) {
        return reply.status(err.statusCode || 400).send({ error: err.message });
      }
    }
  );

  // GET /admin/zones
  app.get('/zones', async (req: FastifyRequest, reply: FastifyReply) => {
    const zones = await adminService.listServiceZones();
    return reply.send({ zones });
  });

  // PATCH /admin/zones/:id
  app.patch(
    '/zones/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const parse = ToggleZoneSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'isActive (boolean) required' });
      }

      const adminId = req.user!.sub;
      const zoneId = req.params.id;

      try {
        const result = await adminService.toggleServiceZone(zoneId, parse.data.isActive, adminId);
        return reply.send(result);
      } catch (err: any) {
        return reply.status(err.statusCode || 400).send({ error: err.message });
      }
    }
  );

  // GET /admin/settlements
  app.get('/settlements', async (req: FastifyRequest, reply: FastifyReply) => {
    const settlements = await adminService.getSettlements();
    return reply.send(settlements);
  });

  // GET /admin/audit-logs
  app.get('/audit-logs', async (req: FastifyRequest, reply: FastifyReply) => {
    const logs = await adminService.listAuditLogs(100);
    return reply.send({ logs });
  });

  // POST /admin/orders/:id/intervene
  app.post(
    '/orders/:id/intervene',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const parse = InterveneOrderSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Invalid action or reason', details: parse.error.format() });
      }

      const adminId = req.user!.sub;
      const orderId = req.params.id;

      try {
        const result = await adminService.interveneOrder(
          orderId,
          parse.data.action,
          adminId,
          parse.data.reason
        );
        return reply.send(result);
      } catch (err: any) {
        return reply.status(err.statusCode || 400).send({ error: err.message });
      }
    }
  );
};
