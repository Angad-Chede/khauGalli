import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { restaurantPortalService } from './portal.service';
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
};
