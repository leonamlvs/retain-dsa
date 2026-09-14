import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { Client } from 'pg';
import type { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';
import {
  readTestDescriptor,
  testConnectionUrl,
} from '../../apps/api/src/infrastructure/database/test-database-descriptor.js';
import { PrismaTransactions } from '../../apps/api/src/infrastructure/database/prisma-transactions.js';
import { createPrismaClient } from '../../apps/api/src/infrastructure/database/prisma-client.js';
import { seedDatabase } from '../../apps/api/src/infrastructure/database/seed.js';
/** Every command validates the run receipt before constructing a database connection. */
export async function migrateTestDatabase(
  environment: NodeJS.ProcessEnv,
  root = process.cwd(),
): Promise<void> {
  const descriptor = await readTestDescriptor(environment, root);
  const client = new Client({ connectionString: testConnectionUrl(descriptor) });
  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query(
      'CREATE TABLE IF NOT EXISTS "RetainMigration" (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)',
    );
    const directory = resolve(root, 'apps/api/prisma/migrations');
    for (const entry of (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const sql = await readFile(resolve(directory, entry.name, 'migration.sql'), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const applied = await client.query<{ checksum: string }>(
        'SELECT checksum FROM "RetainMigration" WHERE name = $1',
        [entry.name],
      );
      if (applied.rows[0]) {
        if (applied.rows[0].checksum !== checksum)
          throw new Error('Applied migration checksum changed.');
      } else {
        await client.query(sql);
        await client.query('INSERT INTO "RetainMigration" (name, checksum) VALUES ($1, $2)', [
          entry.name,
          checksum,
        ]);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}
export async function connectTestDatabase(
  environment: NodeJS.ProcessEnv,
  root = process.cwd(),
): Promise<PrismaClient> {
  const descriptor = await readTestDescriptor(environment, root);
  return createPrismaClient(testConnectionUrl(descriptor));
}
export async function seedTestDatabase(
  environment: NodeJS.ProcessEnv,
  at: Date,
  root = process.cwd(),
): Promise<void> {
  const client = await connectTestDatabase(environment, root);
  try {
    await seedDatabase(new PrismaTransactions(client), at);
  } finally {
    await client.$disconnect();
  }
}
