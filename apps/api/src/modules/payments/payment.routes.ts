import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { webhookService } from './webhook.service';

export const paymentRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Inbound Razorpay Webhook Handler
  app.post('/webhooks/razorpay', async (req: FastifyRequest, reply: FastifyReply) => {
    const signature = (req.headers['x-razorpay-signature'] || '') as string;
    const eventIdHeader = (req.headers['x-razorpay-event-id'] || '') as string;

    // Retrieve the rawBody attached by our custom content type parser
    const rawBody = (req as any).rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

    if (!signature) {
      return reply.status(400).send({
        error: 'Missing required header',
        code: 'MISSING_SIGNATURE',
        message: "'x-razorpay-signature' header is required.",
      });
    }

    try {
      const result = await webhookService.processWebhook(
        rawBody,
        signature,
        req.body,
        eventIdHeader || undefined
      );

      return reply.status(200).send({
        status: 'ok',
        ...result,
      });
    } catch (err: any) {
      if (err.statusCode === 400 || err.code === 'INVALID_SIGNATURE') {
        return reply.status(400).send({
          error: 'Signature verification failed',
          code: 'INVALID_SIGNATURE',
          message: err.message,
        });
      }

      // Log server error but return 500
      req.log.error(err, 'Razorpay webhook processing failed');
      return reply.status(500).send({
        error: 'Internal error processing webhook',
        message: err.message,
      });
    }
  });
};
