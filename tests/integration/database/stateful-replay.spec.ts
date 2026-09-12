import { randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
import fc from 'fast-check';
import { DatabaseHarness } from '../../support/database-harness.js';
import {
  connectTestDatabase,
  migrateTestDatabase,
  seedTestDatabase,
} from '../../support/test-database.js';
import type { PrismaClient } from '../../../apps/api/src/generated/prisma/client.js';
import { PrismaTransactions } from '../../../apps/api/src/infrastructure/database/prisma-transactions.js';
import { PrismaStudyService } from '../../../apps/api/src/infrastructure/database/prisma-study-service.js';
import { FsrsMemoryEngine } from '../../../apps/api/src/infrastructure/fsrs-memory-engine.js';
import { NoOpLogger } from '../../../apps/api/src/shared/observability/logger.interface.js';
import { defaultConfig } from '../../../apps/api/src/config/default-config.js';
import { activateConfiguration } from '../../../apps/api/src/application/activate-configuration.js';
import { PrismaConfigurationRepository } from '../../../apps/api/src/infrastructure/database/prisma-configuration-repository.js';
import type { CurriculumSnapshot } from '../../../apps/api/src/domain/catalog.schema.js';

let harness: DatabaseHarness;
let client: PrismaClient;
let transactions: PrismaTransactions;
let study: PrismaStudyService;
let instant = Date.parse('2026-09-12T12:00:00Z');
const clock = { now: () => new Date(instant) };
const snapshot: CurriculumSnapshot = {
  slug: 'leetcode-75',
  name: 'LeetCode 75',
  skills: [
    {
      slug: 'arrays',
      name: 'Arrays',
      tags: ['array'],
      mappingVersion: 'leetcode75-tags-v1',
      active: true,
    },
  ],
  problems: Array.from({ length: 8 }, (_, i) => ({
    provider: 'leetcode',
    providerId: String(i + 1),
    frontendId: String(i + 1),
    title: `Problem ${i + 1}`,
    slug: `problem-${i + 1}`,
    url: `https://leetcode.com/problems/problem-${i + 1}/`,
    difficulty: i < 5 ? 'Easy' : 'Medium',
    paidOnly: false,
    available: true,
    tags: ['array'],
  })),
  items: Array.from({ length: 8 }, (_, i) => ({
    skillSlug: 'arrays',
    providerId: String(i + 1),
    position: i,
  })),
};
beforeAll(async () => {
  harness = await DatabaseHarness.start();
  await migrateTestDatabase(harness.environment);
  await seedTestDatabase(harness.environment, clock.now());
  client = await connectTestDatabase(harness.environment);
  transactions = new PrismaTransactions(client);
  study = new PrismaStudyService(
    client,
    transactions,
    clock,
    new FsrsMemoryEngine(),
    new NoOpLogger(),
  );
}, 120000);
afterAll(async () => {
  await client?.$disconnect();
  await harness?.stop();
});

async function projections() {
  return {
    memory: await client.skillMemoryState.findMany({
      orderBy: [{ skillId: 'asc' }, { difficulty: 'asc' }],
    }),
    cooldown: await client.userProblemState.findMany({ orderBy: { problemId: 'asc' } }),
    queue: await client.recommendation.findMany({
      select: { id: true, position: true, status: true },
      orderBy: { id: 'asc' },
    }),
  };
}

test('stateful operation prefixes rebuild equivalent projections from source alone', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.constantFrom('save', 'reset', 'catalog', 'config', 'discovery', 'absence'), {
        minLength: 4,
        maxLength: 10,
      }),
      async (operations) => {
        instant += 1000;
        await study.reset((await study.session()).generation);
        await study.acceptCurriculum(snapshot, await study.currentCatalogRevision());
        await study.replenish();
        for (const operation of operations) {
          instant += 1000;
          if (operation === 'save') {
            const queue = await study.recommendations();
            const item = queue.items[0];
            if (item) {
              const key = randomUUID();
              const body = {
                recommendationId: item.id,
                generation: queue.generation,
                feedbackSchemaVersion: 'feedback-v1' as const,
                answers: {
                  independence: 'INDEPENDENT' as const,
                  recognition: 'INDEPENDENT' as const,
                  implementation: 'SMOOTH' as const,
                  complexity: 'CORRECT' as const,
                },
                durationSeconds: 0,
                timezone: 'America/Sao_Paulo',
              };
              const saved = await study.complete(body, key);
              expect((await study.complete(body, key)).body.attempt).toEqual(saved.body.attempt);
            }
          } else if (operation === 'reset') {
            const old = await study.session();
            await study.reset(old.generation);
            expect(await client.attempt.count()).toBe(0);
            expect(await client.attemptFeedback.count()).toBe(0);
            expect(await client.decision.count()).toBe(0);
            expect(await client.recommendationEvent.count()).toBe(0);
            expect(await client.workRequest.count({ where: { generation: old.generation } })).toBe(
              0,
            );
          } else if (operation === 'catalog') {
            await study.acceptCurriculum(
              {
                ...snapshot,
                problems: snapshot.problems.map((p, i) => ({ ...p, paidOnly: i === 0 })),
              },
              await study.currentCatalogRevision(),
            );
          } else if (operation === 'config') {
            await activateConfiguration(
              {
                ...defaultConfig,
                version: randomUUID(),
                scheduler: { ...defaultConfig.scheduler, queueSize: 3 },
              },
              new PrismaConfigurationRepository(transactions),
              clock,
            );
          } else if (operation === 'absence') {
            instant += 200 * 86400000;
          } else {
            const need = (await study.discoveryNeeds())[0];
            if (need)
              await study.acceptDiscoveryPage(need, {
                problems: [],
                offset: need.offset,
                nextOffset: need.offset,
                total: need.offset,
                exhausted: true,
              });
          }
          await study.replenish();
          const expected = await projections();
          const sourceCounts = [
            await client.attempt.count(),
            await client.decision.count(),
            await client.recommendationEvent.count(),
          ];
          const analytics = await study.analytics({ timezone: 'America/Sao_Paulo' });
          await client.skillMemoryState.deleteMany();
          await client.userProblemState.deleteMany();
          await client.recommendation.updateMany({ data: { status: 'REPLACED', position: 999 } });
          const user = await client.localUser.findFirstOrThrow();
          await study.rebuildProjections({
            userId: user.id,
            evaluationTime: clock.now(),
            cutoffSequence: user.sourceSequence,
          });
          expect(await projections()).toEqual(expected);
          expect([
            await client.attempt.count(),
            await client.decision.count(),
            await client.recommendationEvent.count(),
          ]).toEqual(sourceCounts);
          expect(await study.analytics({ timezone: 'America/Sao_Paulo' })).toEqual({
            ...analytics,
            stateRevision: (await study.session()).stateRevision,
          });
          const queue = await study.recommendations();
          expect(new Set(queue.items.map((item) => item.providerProblemId)).size).toBe(
            queue.items.length,
          );
          expect(queue.items.length).toBeLessThanOrEqual(
            (await study.activeConfiguration()).scheduler.queueSize,
          );
        }
      },
    ),
    { numRuns: 8 },
  );
}, 120000);

test('a concurrent revision change prevents staged projection publication', async () => {
  const before = await projections();
  const write = transactions.write.bind(transactions);
  const spy = jest.spyOn(transactions, 'write').mockImplementationOnce(async (operation) => {
    await write(async ({ db }) => {
      await db.applicationState.update({
        where: { id: 1 },
        data: { stateRevision: { increment: 1n } },
      });
    });
    return write(operation);
  });
  try {
    await expect(study.rebuildProjections()).rejects.toMatchObject({
      code: 'REPLAY_PUBLICATION_CONFLICT',
    });
  } finally {
    spy.mockRestore();
  }
  expect(await projections()).toEqual(before);
});

test('durable leases serialize workers, recover expiry and fence reset', async () => {
  instant += 1000;
  await study.reset((await study.session()).generation);
  const config = await study.activeConfiguration();
  const first = randomUUID();
  const second = randomUUID();
  expect(
    await Promise.all([
      study.claimMaintenance(first, config.version),
      study.claimMaintenance(second, config.version),
    ]),
  ).toEqual([true, false]);
  instant += config.discovery.totalBudgetMs + config.discovery.workerRetryMs + 1;
  expect(await study.claimMaintenance(second, config.version)).toBe(true);
  await expect(study.replenish(config.version, first)).rejects.toMatchObject({
    code: 'STALE_MAINTENANCE',
  });
  await study.reset((await study.session()).generation);
  await expect(study.replenish(config.version, second)).rejects.toMatchObject({
    code: 'STALE_MAINTENANCE',
  });
  await study.releaseMaintenance(second);
});
