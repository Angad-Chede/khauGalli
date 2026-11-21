import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { cartService } from './cart.service';
import { authenticate } from '../../middleware/auth.middleware';

const UpdateCartSchema = z.object({
  restaurantId: z.string().uuid(),
  addressId: z.string().uuid(),
  items: z.array(
    z.object({
      menuItemId: z.string().uuid(),
      quantity: z.number().int().min(1).max(50),
      selectedModifierOptionIds: z.array(z.string().uuid()).optional().default([]),
    })
  ).min(1, 'At least one item required in cart'),
  replaceExisting: z.boolean().optional().default(false),
});

export const cartRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Apply auth middleware to all cart operations
  app.addHook('preHandler', authenticate);

  // GET /cart
  app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = req.user!.sub;
    const result = await cartService.getCart(userId);
    return reply.send(result);
  });

  // PUT /cart
  app.put('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const parse = UpdateCartSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parse.error.format(),
      });
    }

    const userId = req.user!.sub;

    try {
      const result = await cartService.updateCart(userId, parse.data);
      return reply.send(result);
    } catch (err: any) {
      if (err.statusCode === 409) {
        return reply.status(409).send({
          code: err.code || 'RESTAURANT_CONFLICT',
          error: err.message,
          currentRestaurant: err.currentRestaurant,
          newRestaurant: err.newRestaurant,
        });
      }
      return reply.status(err.statusCode || 400).send({
        error: err.message || 'Failed to update cart',
      });
    }
  });

  // DELETE /cart
  app.delete('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = req.user!.sub;
    await cartService.clearCart(userId);
    return reply.send({ success: true, message: 'Cart cleared successfully' });
  });
};
