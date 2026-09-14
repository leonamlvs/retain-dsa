import { readFile } from 'node:fs/promises';
import { activateConfiguration } from '../apps/api/src/application/activate-configuration.js';
import { PrismaConfigurationRepository } from '../apps/api/src/infrastructure/database/prisma-configuration-repository.js';
import { createPrismaClient } from '../apps/api/src/infrastructure/database/prisma-client.js';
import { PrismaTransactions } from '../apps/api/src/infrastructure/database/prisma-transactions.js';
import {
  readTestDescriptor,
  testConnectionUrl,
} from '../apps/api/src/infrastructure/database/test-database-descriptor.js';
import { SystemClock } from '../apps/api/src/infrastructure/system-clock.js';
import { studyConfigSchema } from '../apps/api/src/config/study-config.schema.js';

const [flag, file, confirmation] = process.argv.slice(2);
if (flag !== '--snapshot' || !file || confirmation !== '--activate-local')
  throw new Error('Usage: yarn config:activate --snapshot <complete-config.json> --activate-local');
const snapshot = studyConfigSchema.parse(JSON.parse(await readFile(file, 'utf8')));
const connectionString =
  process.env.NODE_ENV === 'test'
    ? testConnectionUrl(await readTestDescriptor(process.env, process.cwd()))
    : process.env.DATABASE_URL;
if (!connectionString)
  throw new Error('An explicit DATABASE_URL is required; .env is never loaded.');
const client = createPrismaClient(connectionString);
try {
  await activateConfiguration(
    snapshot,
    new PrismaConfigurationRepository(new PrismaTransactions(client)),
    new SystemClock(),
  );
  process.stdout.write(`Activated configuration ${snapshot.version}.\n`);
} finally {
  await client.$disconnect();
}
