import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createDirectClient } from './client';
import * as path from 'path';

export async function runMigrations() {
  console.log('Connecting to database for migrations via direct unpooled client...');
  const directClient = createDirectClient();
  await directClient.connect();

  try {
    console.log('Ensuring PostgreSQL extensions (postgis, pg_trgm, pgcrypto)...');
    await directClient.query('CREATE EXTENSION IF NOT EXISTS postgis;');
    await directClient.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
    await directClient.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');

    const drizzleDb = drizzle(directClient);
    const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
    console.log(`Applying Drizzle migrations from: ${migrationsFolder}`);
    await migrate(drizzleDb, { migrationsFolder });
    console.log('✓ All migrations applied successfully.');
  } catch (error) {
    console.error('Migration execution failed:', error);
    throw error;
  } finally {
    await directClient.end();
  }
}

// Execute migrations only when executed directly via CLI
if (process.argv[1]?.includes('migrate')) {
  runMigrations().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
