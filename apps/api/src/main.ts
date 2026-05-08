import http from 'node:http';
import { compose } from './composition.js';
import { buildApp } from './app.js';
import { startWorkers } from './modules/scraper/queue/scraper.queue.js';

async function main() {
  const composition = await compose();
  const { env, logger, scraperGateway, scraperOrchestrator, redisConnection } = composition;

  const app = buildApp(composition);
  const server = http.createServer(app);

  scraperGateway.attach(server);

  const workers = startWorkers({
    connection: redisConnection,
    logger,
    orchestrator: scraperOrchestrator,
  });

  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'API listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    await workers.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal during startup:', err);
  process.exit(1);
});
