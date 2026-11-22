import { db, outboxEvents, orders } from '@tiffin/db';
import { sql, eq } from 'drizzle-orm';
import Redis from 'ioredis';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: { colorize: true },
        }
      : undefined,
});

export const redisPublisher = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

export class OutboxRelayWorker {
  private isRunning: boolean = false;
  private pollIntervalMs: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(pollIntervalMs: number = 1000) {
    this.pollIntervalMs = pollIntervalMs;
  }

  /**
   * Process a single batch of pending outbox events using FOR UPDATE SKIP LOCKED
   */
  async processBatch(): Promise<number> {
    try {
      return await db.transaction(async (tx) => {
        // Concurrency-safe lock skipping rows already being processed by other worker instances
        const pendingEventsResult = await tx.execute(sql`
          SELECT id, aggregate_type, aggregate_id, event_type, payload, created_at
          FROM outbox_events
          WHERE processed_at IS NULL
          ORDER BY created_at ASC
          LIMIT 50
          FOR UPDATE SKIP LOCKED;
        `);

        const rows = pendingEventsResult.rows as any[];
        if (!rows || rows.length === 0) {
          return 0;
        }

        const processedIds: string[] = [];

        for (const row of rows) {
          const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
          const eventMessage = JSON.stringify({
            id: row.id,
            aggregateType: row.aggregate_type,
            aggregateId: row.aggregate_id,
            eventType: row.event_type,
            payload,
            createdAt: row.created_at,
          });

          // Dispatch to Redis Pub/Sub channels
          try {
            if (payload?.restaurantId) {
              await redisPublisher.publish(`restaurant:${payload.restaurantId}:orders`, eventMessage);
            }
            if (payload?.orderId) {
              await redisPublisher.publish(`order:${payload.orderId}:updates`, eventMessage);
            }
            await redisPublisher.publish('system:events', eventMessage);

            processedIds.push(row.id);
          } catch (pubErr) {
            logger.error({ err: pubErr, eventId: row.id }, 'Failed to publish event to Redis');
            // If publish fails, do not mark as processed so it retries on next tick
          }
        }

        if (processedIds.length > 0) {
          await tx.execute(sql`
            UPDATE outbox_events
            SET processed_at = NOW()
            WHERE id = ANY(${processedIds});
          `);
        }

        return processedIds.length;
      });
    } catch (err: any) {
      logger.error({ err: err.message }, 'Outbox relay batch execution error');
      return 0;
    }
  }

  /**
   * Start polling loop
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('Starting Outbox Relay Worker...');

    try {
      await redisPublisher.connect();
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Redis publisher connect deferred');
    }

    const poll = async () => {
      if (!this.isRunning) return;

      const processedCount = await this.processBatch();
      if (processedCount > 0) {
        logger.info({ count: processedCount }, 'Relayed outbox event batch');
      }

      // Fast-poll if there were events, else wait for configured interval
      const delay = processedCount >= 50 ? 50 : this.pollIntervalMs;
      this.timer = setTimeout(poll, delay);
    };

    poll();
  }

  /**
   * Graceful stop
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await redisPublisher.quit().catch(() => {});
    logger.info('Outbox Relay Worker stopped');
  }
}

export const outboxRelayWorker = new OutboxRelayWorker();
