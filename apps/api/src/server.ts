import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { authRoutes } from './modules/auth/auth.routes';
import { catalogRoutes } from './modules/catalog/catalog.routes';
import { cartRoutes } from './modules/cart/cart.routes';
import { restaurantPortalRoutes } from './modules/restaurant-portal/portal.routes';
import { orderRoutes } from './modules/orders/order.routes';
import { paymentRoutes } from './modules/payments/payment.routes';

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
    },
  });

  // Preserve raw body buffer for cryptographically verified webhook HMAC checks
  server.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req: any, body: Buffer, done) => {
      try {
        const rawString = body.toString('utf-8');
        req.rawBody = rawString;
        const json = rawString ? JSON.parse(rawString) : {};
        done(null, json);
      } catch (err: any) {
        err.statusCode = 400;
        done(err, undefined);
      }
    }
  );

  await server.register(sensible);
  await server.register(cors, {
    origin: true,
    credentials: true,
  });

  await server.register(swagger, {
    openapi: {
      info: {
        title: 'Tiffin (KhauGalli) API',
        description: 'Multi-role Food Ordering & Delivery Platform API (Customer, Kitchen, Delivery, Admin)',
        version: '1.0.0',
      },
      servers: [
        {
          url: 'http://localhost:4000',
          description: 'Local development server',
        },
      ],
    },
  });

  await server.register(swaggerUi, {
    routePrefix: '/docs',
  });

  // Health check endpoint
  server.get('/health', async () => {
    return {
      status: 'ok',
      service: 'tiffin-api',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  });

  // Core API Modules
  await server.register(authRoutes, { prefix: '/auth' });
  await server.register(catalogRoutes);
  await server.register(cartRoutes, { prefix: '/cart' });
  await server.register(restaurantPortalRoutes, { prefix: '/r' });
  await server.register(orderRoutes, { prefix: '/orders' });
  await server.register(paymentRoutes);

  return server;
}
