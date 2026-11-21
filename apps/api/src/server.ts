import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { authRoutes } from './modules/auth/auth.routes';

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
    },
  });

  await server.register(sensible);
  await server.register(cors, {
    origin: true,
    credentials: true,
  });

  await server.register(swagger, {
    openapi: {
      info: {
        title: 'Tiffin (KhauGalli) API',
        description: 'Multi-role Food Ordering & Delivery Platform API',
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

  // Auth routes
  await server.register(authRoutes, { prefix: '/auth' });

  return server;
}
