import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { restaurantPortalService } from './portal.service';
import { restaurantOrdersService } from './restaurant-orders.service';
import { requireStaffMember } from '../../middleware/auth.middleware';

const StatusSchema = z.object({
  acceptingOrders: z.boolean(),
});

const ItemAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
});

const CreateItemSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  pricePaise: z.number().int().min(1),
  isVeg: z.boolean().default(true),
  imageUrl: z.string().url().optional(),
});

const UpdateItemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  pricePaise: z.number().int().min(1).optional(),
  isVeg: z.boolean().optional(),
  imageUrl: z.string().url().optional(),
});

const AcceptOrderSchema = z.object({
  prepTimeMinutes: z.number().int().min(1).max(180).optional().default(20),
});

const RejectOrderSchema = z.object({
  reason: z.string().min(2, 'Rejection reason is required').max(300),
});

export const restaurantPortalRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Enforce staff membership on all portal endpoints
  app.addHook('preHandler', requireStaffMember);

  // GET /r/profile
  app.get('/profile', async (req: FastifyRequest, reply: FastifyReply) => {
    const restaurantId = req.staff!.restaurantId;
    const profile = await restaurantPortalService.getProfile(restaurantId);
    return reply.send(profile);
  });

  // PATCH /r/status
  app.patch('/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const parse = StatusSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parse.error.format() });
    }

    const { restaurantId, staffRole } = req.staff!;
    const userId = req.user!.sub;

    const result = await restaurantPortalService.updateStatus(
      restaurantId,
      parse.data.acceptingOrders,
      userId,
      staffRole
    );
    return reply.send(result);
  });

  // GET /r/menu
  app.get('/menu', async (req: FastifyRequest, reply: FastifyReply) => {
    const restaurantId = req.staff!.restaurantId;
    const menu = await restaurantPortalService.getStaffMenu(restaurantId);
    return reply.send(menu);
  });

  // PATCH /r/menu/items/:id/availability
  app.patch(
    '/menu/items/:id/availability',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const parse = ItemAvailabilitySchema.safeParse(req.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'isAvailable (boolean) required' });
      }

      const { restaurantId, staffRole } = req.staff!;
      const userId = req.user!.sub;
      const itemId = req.params.id;

      try {
        const result = await restaurantPortalService.updateItemAvailability(
          restaurantId,
          itemId,
          parse.data.isAvailable,
          userId,
          staffRole
        );
        return reply.send(result);
      } catch (err: any) {
        return reply.status(err.statusCode || 400).send({ error: err.message });
      }
    }
  );

  // POST /r/menu/items
  app.post('/menu/items', async (req: FastifyRequest, reply: FastifyReply) => {
    const parse = CreateItemSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parse.error.format() });
    }

    const { restaurantId, staffRole } = req.staff!;
    const userId = req.user!.sub;

    const result = await restaurantPortalService.createItem(
      restaurantId,
      parse.data,
      userId,
      staffRole
    );
    return reply.status(201).send(result);
  });

  // PATCH /r/menu/items/:id
  app.patch(
    '/menu/items/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const parse = UpdateItemSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Validation failed', details: parse.error.format() });
      }

      const { restaurantId, staffRole } = req.staff!;
      const userId = req.user!.sub;
      const itemId = req.params.id;

      try {
        const result = await restaurantPortalService.updateItem(
          restaurantId,
          itemId,
          parse.data,
          userId,
          staffRole
        );
        return reply.send(result);
      } catch (err: any) {
        return reply.status(err.statusCode || 400).send({ error: err.message });
      }
    }
  );

  // ==========================================
  // Kitchen Display System (KDS) Order Endpoints
  // ==========================================

  // GET /r/orders (Active orders for KDS board)
  app.get('/orders', async (req: FastifyRequest, reply: FastifyReply) => {
    const restaurantId = req.staff!.restaurantId;
    const activeOrders = await restaurantOrdersService.getActiveOrders(restaurantId);
    return reply.send({ orders: activeOrders });
  });

  // POST /r/orders/:id/accept
  app.post(
    '/orders/:id/accept',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const parse = AcceptOrderSchema.safeParse(req.body || {});
      if (!parse.success) {
        return reply.status(400).send({ error: 'Invalid payload', details: parse.error.format() });
      }

      const { restaurantId } = req.staff!;
      const staffId = req.user!.sub;
      const orderId = req.params.id;

      try {
        const result = await restaurantOrdersService.acceptOrder(
          restaurantId,
          orderId,
          staffId,
          parse.data.prepTimeMinutes
        );
        return reply.send({ success: true, message: 'Order accepted', order: result });
      } catch (err: any) {
        return reply.status(err.statusCode || 400).send({
          code: err.code || 'ACCEPT_FAILED',
          error: err.message,
        });
      }
    }
  );

  // POST /r/orders/:id/reject
  app.post(
    '/orders/:id/reject',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const parse = RejectOrderSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Rejection reason is required', details: parse.error.format() });
      }

      const { restaurantId } = req.staff!;
      const staffId = req.user!.sub;
      const orderId = req.params.id;

      try {
        const result = await restaurantOrdersService.rejectOrder(
          restaurantId,
          orderId,
          staffId,
          parse.data.reason
        );
        return reply.send({ success: true, message: 'Order rejected', order: result });
      } catch (err: any) {
        return reply.status(err.statusCode || 400).send({
          code: err.code || 'REJECT_FAILED',
          error: err.message,
        });
      }
    }
  );

  // POST /r/orders/:id/ready
  app.post(
    '/orders/:id/ready',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { restaurantId } = req.staff!;
      const staffId = req.user!.sub;
      const orderId = req.params.id;

      try {
        const result = await restaurantOrdersService.markReady(restaurantId, orderId, staffId);
        return reply.send({ success: true, message: 'Order marked ready', order: result });
      } catch (err: any) {
        return reply.status(err.statusCode || 400).send({
          code: err.code || 'READY_FAILED',
          error: err.message,
        });
      }
    }
  );
};
