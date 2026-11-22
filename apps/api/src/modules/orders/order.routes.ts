import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { orderService } from './order.service';
import { authenticate } from '../../middleware/auth.middleware';

const CreateOrderSchema = z.object({
  quoteId: z.string().min(1, 'quoteId is required'),
  restaurantId: z.string().uuid('Invalid restaurantId'),
  addressId: z.string().uuid('Invalid addressId'),
  paymentMode: z.enum(['ONLINE', 'COD']),
  customerNotes: z.string().max(300).optional(),
});

const CancelOrderSchema = z.object({
  reason: z.string().min(2, 'Cancellation reason is required').max(300),
});

export const orderRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', authenticate);

  // POST /orders (Place an order)
  app.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    if (!idempotencyKey || !idempotencyKey.trim()) {
      return reply.status(400).send({
        error: 'Missing required header',
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: "'Idempotency-Key' header is required for all order placement requests.",
      });
    }

    const parse = CreateOrderSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parse.error.format(),
      });
    }

    const userId = req.user!.sub;

    try {
      const result = await orderService.createOrder(userId, parse.data, idempotencyKey);
      const statusCode = result.isReplay ? 200 : 201;
      return reply.status(statusCode).send(result);
    } catch (err: any) {
      if (err.statusCode === 409) {
        return reply.status(409).send({
          code: err.code || 'PRICE_CHANGED',
          error: err.message,
          refreshedQuote: err.refreshedQuote,
        });
      }
      return reply.status(err.statusCode || 500).send({
        code: err.code || 'ORDER_CREATION_FAILED',
        error: err.message || 'Failed to place order',
      });
    }
  });

  // GET /orders (Customer order history)
  app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = req.user!.sub;
    const orders = await orderService.listCustomerOrders(userId);
    return reply.send({ orders });
  });

  // GET /orders/:id (Order tracking & details)
  app.get('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = req.user!.sub;
    const userRoles = req.user!.roles || [];
    const orderId = req.params.id;

    try {
      const order = await orderService.getOrderById(orderId, userId, userRoles);
      return reply.send({ order });
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({
        error: err.message || 'Failed to retrieve order',
      });
    }
  });

  // POST /orders/:id/cancel
  app.post('/:id/cancel', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = req.user!.sub;
    const orderId = req.params.id;

    const parse = CancelOrderSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parse.error.format(),
      });
    }

    try {
      const result = await orderService.cancelOrder(orderId, userId, parse.data.reason);
      return reply.send({
        success: true,
        message: 'Order cancelled successfully',
        order: result.order,
      });
    } catch (err: any) {
      return reply.status(err.statusCode || 400).send({
        code: err.code || 'CANCELLATION_FAILED',
        error: err.message,
      });
    }
  });
};
