import * as dotenv from 'dotenv';
import { validateEnv } from '@tiffin/shared';
import { buildServer } from './server';

dotenv.config({ path: '../../.env' });

// Validate environment variables with strict production security gate
const env = validateEnv(process.env);

async function start() {
  try {
    const server = await buildServer();
    await server.listen({
      port: env.PORT,
      host: env.HOST,
    });
    console.log(`🚀 Tiffin API server running at http://${env.HOST}:${env.PORT}`);
    console.log(`📖 Interactive API Documentation available at http://${env.HOST}:${env.PORT}/docs`);
  } catch (err) {
    console.error('Server startup failed:', err);
    process.exit(1);
  }
}

start();
