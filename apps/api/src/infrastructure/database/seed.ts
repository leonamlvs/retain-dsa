import { randomUUID, createHash } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import { defaultConfig } from '../../config/default-config.js';
import type { PrismaTransactions } from './prisma-transactions.js';
export async function seedDatabase(transactions: PrismaTransactions, at: Date): Promise<void> {
  await transactions.write(async ({ db }) => {
    if (await db.localUser.count()) return;
    const userId = randomUUID();
    const generation = randomUUID();
    await db.configuration.create({
      data: {
        version: defaultConfig.version,
        parameters: defaultConfig as Prisma.InputJsonValue,
        contentHash: createHash('sha256').update(JSON.stringify(defaultConfig)).digest('hex'),
      },
    });
    await db.configurationActivation.create({
      data: { id: randomUUID(), sequence: 1n, activatedAt: at, version: defaultConfig.version },
    });
    await db.catalogRevision.create({
      data: {
        revision: 0n,
        observedAt: at,
        acceptedAt: at,
        sourceSequence: 2n,
        queryVersion: defaultConfig.discovery.queryVersion,
        mappingVersion: defaultConfig.discovery.mappingVersion,
        contentHash: createHash('sha256').update('{}').digest('hex'),
        snapshot: { problems: [], skills: [], items: [] },
      },
    });
    await db.localUser.create({
      data: { id: userId, generation, createdAt: at },
    });
    await db.workRequest.create({
      data: {
        id: randomUUID(),
        userId,
        generation,
        kind: 'REFILL',
        requestedAt: at,
        nextRunAt: at,
        status: 'PENDING',
        details: { reason: 'INITIAL_QUEUE' },
      },
    });
    await db.applicationState.update({
      where: { id: 1 },
      data: { activeConfig: defaultConfig.version, sourceSequence: 2n, lastBusinessAt: at },
    });
  });
}
