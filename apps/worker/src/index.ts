import { outboxRelayWorker } from './outbox-relay';

async function main() {
  console.log('Starting Tiffin Background Worker Service...');

  await outboxRelayWorker.start();

  const handleShutdown = async (signal: string) => {
    console.log(`Received ${signal}. Shutting down worker...`);
    await outboxRelayWorker.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal worker startup error:', err);
  process.exit(1);
});
