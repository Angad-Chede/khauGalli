import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index';
import * as dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

const { Pool } = pg;

const appDatabaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/tiffin_db';
const directDatabaseUrl = process.env.DIRECT_DATABASE_URL || appDatabaseUrl;

export const pool = new Pool({
  connectionString: appDatabaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });

export function createDirectClient(): pg.Client {
  return new pg.Client({
    connectionString: directDatabaseUrl,
  });
}

export { schema };
