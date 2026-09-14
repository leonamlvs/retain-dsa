import { defaultConfig } from './config/default-config.js';
import { createApp } from './http/create-app.js';
import { PrismaStudyService } from './infrastructure/database/prisma-study-service.js';
import { PrismaTransactions } from './infrastructure/database/prisma-transactions.js';
import { seedDatabase } from './infrastructure/database/seed.js';
import { FsrsMemoryEngine } from './infrastructure/fsrs-memory-engine.js';
import { createLogger } from './infrastructure/pino-logger.js';
import { LeetCodeProvider } from './infrastructure/providers/leetcode/leetcode.provider.js';
import { NodeHttpTransport } from './infrastructure/providers/leetcode/node-http-transport.js';
import { SystemClock, SystemSleeper } from './infrastructure/system-clock.js';
import { MaintenanceCoordinator } from './application/maintenance-coordinator.js';
import { createRuntimeServer } from './http/runtime-server.js';
import { createPrismaClient } from './infrastructure/database/prisma-client.js';
import { errorDetails } from './shared/observability/error-details.js';

const logger = createLogger(process.env.LOG_LEVEL);
logger.event('runtime.starting');
let stopping = false;
const clock = new SystemClock();
const client = createPrismaClient(process.env.DATABASE_URL ?? '');
const transactions = new PrismaTransactions(client);
await client.$connect();
await seedDatabase(transactions, clock.now());
const study = new PrismaStudyService(client, transactions, clock, new FsrsMemoryEngine(), logger);
const providerState: { current: 'available' | 'degraded' | 'unknown' } = { current: 'unknown' };
const createProvider = (config: typeof defaultConfig) =>
  new LeetCodeProvider(new NodeHttpTransport(), clock, new SystemSleeper(), config, logger);
const maintenance = new MaintenanceCoordinator(
  study,
  createProvider,
  clock,
  defaultConfig,
  logger,
  (status) => (providerState.current = status),
);
const app = createApp(
  study,
  logger,
  () => providerState.current,
  () => {
    if (stopping) return;
    void maintenance
      .run()
      .catch((error: unknown) =>
        logger.error('recommendation.refill_failed', { error: errorDetails(error) }),
      );
  },
);
const { server, closeWeb } = await createRuntimeServer(app, {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
server.listen(port, host, () => logger.event('runtime.started', { host, port }));

const startupTask = (async () => {
  try {
    logger.event('curriculum.sync.started');
    const revision = await study.currentCatalogRevision();
    const startupConfig = await study.activeConfiguration();
    const snapshot = await createProvider(startupConfig).curriculum(
      new Date(clock.now().getTime() + startupConfig.discovery.totalBudgetMs),
    );
    await study.acceptCurriculum(snapshot, revision);
    providerState.current = 'available';
  } catch (error) {
    providerState.current = 'degraded';
    logger.error('curriculum.sync.failed', {
      error: errorDetails(error),
      code: error instanceof Error && 'code' in error ? error.code : 'UNKNOWN',
    });
  }
  if (stopping) return;
  await maintenance.run().catch((error: unknown) =>
    logger.error('recommendation.refill_failed', {
      error: errorDetails(error),
      code: error instanceof Error && 'code' in error ? error.code : 'UNKNOWN',
    }),
  );
})();

const worker = setInterval(
  () =>
    void maintenance.run().catch((error: unknown) =>
      logger.error('recommendation.refill_failed', {
        error: errorDetails(error),
        code: error instanceof Error && 'code' in error ? error.code : 'UNKNOWN',
      }),
    ),
  defaultConfig.discovery.workerRetryMs,
);
worker.unref();
logger.event('worker.started', { intervalMs: defaultConfig.discovery.workerRetryMs });

async function stop(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => {
    logger.error('runtime.shutdown_timeout', { timeoutMs: 120_000 });
    process.exit(1);
  }, 120_000);
  deadline.unref();
  clearInterval(worker);
  logger.event('worker.stopped');
  logger.event('runtime.stopping', { signal });
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  await closeWeb();
  await startupTask;
  await maintenance
    .drain()
    .catch((error: unknown) => logger.error('worker.drain_failed', { error: errorDetails(error) }));
  await client.$disconnect();
  clearTimeout(deadline);
  logger.event('runtime.stopped');
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => void stop(signal));
