import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { catalogService } from './catalog.service';

const NearbyQuerySchema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  radius: z.coerce.number().optional().default(5000),
  page: z.coerce.number().optional().default(1),
  limit: z.coerce.number().optional().default(20),
});

const SearchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required'),
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  radius: z.coerce.number().optional().default(6000),
  page: z.coerce.number().optional().default(1),
  limit: z.coerce.number().optional().default(20),
});

export const catalogRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /restaurants?lat=...&lng=...&radius=...
  app.get('/restaurants', async (req: FastifyRequest, reply: FastifyReply) => {
    const parse = NearbyQuerySchema.safeParse(req.query);
    if (!parse.success) {
      return reply.status(400).send({
        error: 'Invalid query parameters',
        details: parse.error.format(),
      });
    }

    const { lat, lng, radius, page, limit } = parse.data;
    const result = await catalogService.getNearbyRestaurants(lat, lng, radius, page, limit);
    return reply.send(result);
  });

  // GET /restaurants/search?q=...&lat=...&lng=...
  app.get('/restaurants/search', async (req: FastifyRequest, reply: FastifyReply) => {
    const parse = SearchQuerySchema.safeParse(req.query);
    if (!parse.success) {
      return reply.status(400).send({
        error: 'Invalid search parameters',
        details: parse.error.format(),
      });
    }

    const { q, lat, lng, radius, page, limit } = parse.data;
    const results = await catalogService.searchCatalog(q, lat, lng, radius, page, limit);
    return reply.send(results);
  });

  // GET /restaurants/:id/menu
  app.get('/restaurants/:id/menu', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    try {
      const menu = await catalogService.getRestaurantMenu(id);
      return reply.send(menu);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message || 'Restaurant not found' });
    }
  });
};
