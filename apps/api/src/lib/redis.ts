import { Redis } from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Standalone in-memory fallback map for unit tests where external Redis service is omitted
const memoryStore = new Map<string, { val: string; expiresAt: number | null }>();

export class SafeRedisClient {
  private client: Redis | null = null;
  private isConnected = false;

  constructor() {
    try {
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        enableOfflineQueue: false,
      });

      this.client.connect()
        .then(() => {
          this.isConnected = true;
          console.log('✓ Connected to Redis at', redisUrl);
        })
        .catch(() => {
          this.isConnected = false;
        });

      this.client.on('error', () => {
        this.isConnected = false;
      });
      this.client.on('ready', () => {
        this.isConnected = true;
      });
    } catch {
      this.isConnected = false;
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.get(key);
      } catch {
        // Fallback
      }
    }
    const item = memoryStore.get(key);
    if (!item) return null;
    if (item.expiresAt !== null && Date.now() > item.expiresAt) {
      memoryStore.delete(key);
      return null;
    }
    return item.val;
  }

  async set(key: string, value: string, mode?: 'EX', ttlSeconds?: number): Promise<'OK'> {
    if (this.isConnected && this.client) {
      try {
        if (mode === 'EX' && ttlSeconds) {
          return await this.client.set(key, value, 'EX', ttlSeconds);
        }
        return await this.client.set(key, value);
      } catch {
        // Fallback
      }
    }
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    memoryStore.set(key, { val: value, expiresAt });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.del(key);
      } catch {
        // Fallback
      }
    }
    const existed = memoryStore.has(key);
    memoryStore.delete(key);
    return existed ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.incr(key);
      } catch {
        // Fallback
      }
    }
    const current = await this.get(key);
    const count = (current ? parseInt(current, 10) : 0) + 1;
    await this.set(key, count.toString());
    return count;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.expire(key, seconds);
      } catch {
        // Fallback
      }
    }
    const item = memoryStore.get(key);
    if (item) {
      item.expiresAt = Date.now() + seconds * 1000;
      return 1;
    }
    return 0;
  }
}

export const redis = new SafeRedisClient();
