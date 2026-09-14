import type { PrismaClient } from '../../../apps/api/src/generated/prisma/client.js';
import { DatabaseHarness } from '../../support/database-harness.js';
import {
  connectTestDatabase,
  migrateTestDatabase,
  seedTestDatabase,
} from '../../support/test-database.js';
import { PrismaTransactions } from '../../../apps/api/src/infrastructure/database/prisma-transactions.js';
import { PrismaStudyService } from '../../../apps/api/src/infrastructure/database/prisma-study-service.js';
import { FsrsMemoryEngine } from '../../../apps/api/src/infrastructure/fsrs-memory-engine.js';
import { NoOpLogger } from '../../../apps/api/src/shared/observability/logger.interface.js';
import type { Clock } from '../../../apps/api/src/domain/clock.interface.js';
import { defaultConfig } from '../../../apps/api/src/config/default-config.js';
import { discoveryFingerprint } from '../../../apps/api/src/modules/discovery/discovery-fingerprint.js';
import { activateConfiguration } from '../../../apps/api/src/application/activate-configuration.js';
import { PrismaConfigurationRepository } from '../../../apps/api/src/infrastructure/database/prisma-configuration-repository.js';
let harness: DatabaseHarness;
let client: PrismaClient;
let transactions: PrismaTransactions;
beforeAll(async () => {
  harness = await DatabaseHarness.start();
  await migrateTestDatabase(harness.environment);
  await seedTestDatabase(harness.environment, new Date('2026-01-01T00:00:00Z'));
  client = await connectTestDatabase(harness.environment);
  transactions = new PrismaTransactions(client);
}, 120000);
afterAll(async () => {
  await client?.$disconnect();
  await harness?.stop();
});
test('migrations and seed are repeatable without replacing the source root', async () => {
  const before = await client.localUser.findFirstOrThrow();
  const initialRefill = await client.workRequest.findFirstOrThrow({
    where: { userId: before.id, generation: before.generation, kind: 'REFILL' },
  });
  expect(initialRefill).toMatchObject({ status: 'PENDING', details: { reason: 'INITIAL_QUEUE' } });
  await migrateTestDatabase(harness.environment);
  await seedTestDatabase(harness.environment, new Date('2027-01-01T00:00:00Z'));
  expect(await client.localUser.findFirstOrThrow()).toEqual(before);
  expect(await client.configurationActivation.count()).toBe(1);
  expect(await client.workRequest.count({ where: { kind: 'REFILL' } })).toBe(1);
});
test('rollback preserves both the source sequence and revision', async () => {
  const before = await client.applicationState.findUniqueOrThrow({ where: { id: 1 } });
  await expect(
    transactions.write(async ({ db }) => {
      await db.applicationState.update({
        where: { id: 1 },
        data: { stateRevision: { increment: 1 }, sourceSequence: { increment: 1 } },
      });
      throw new Error('injected failure');
    }),
  ).rejects.toThrow('injected failure');
  expect(await client.applicationState.findUniqueOrThrow({ where: { id: 1 } })).toEqual(before);
});
test('serializes decision reads after lock acquisition across competing writers', async () => {
  let entered!: () => void;
  const firstEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = transactions.write(async ({ db }) => {
    const state = await db.applicationState.findUniqueOrThrow({ where: { id: 1 } });
    entered();
    await barrier;
    await db.applicationState.update({
      where: { id: 1 },
      data: { stateRevision: { increment: 1 } },
    });
    return state.stateRevision;
  });
  await firstEntered;
  const second = transactions.write(
    async ({ db }) =>
      (await db.applicationState.findUniqueOrThrow({ where: { id: 1 } })).stateRevision,
  );
  release();
  const [before, after] = await Promise.all([first, second]);
  expect(after).toBe(before + 1n);
});
test('consistent reads reject writes at the database boundary', async () => {
  await expect(
    transactions.read(async ({ db }) =>
      db.applicationState.update({ where: { id: 1 }, data: { stateRevision: { increment: 1 } } }),
    ),
  ).rejects.toThrow();
});
test('singleton checks protect the canonical lock root', async () => {
  await expect(
    client.applicationState.create({ data: { id: 2, activeConfig: 'retain-v1' } }),
  ).rejects.toThrow();
});

test('completion is atomic, replayable, recordable after retirement, and reset preserves global data', async () => {
  const clock: Clock = { now: () => new Date('2026-01-02T12:00:00.000Z') };
  const study = new PrismaStudyService(
    client,
    transactions,
    clock,
    new FsrsMemoryEngine(),
    new NoOpLogger(),
  );
  await study.acceptCurriculum(
    {
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
      problems: [
        {
          provider: 'leetcode',
          providerId: '1',
          frontendId: '1',
          title: 'Two Sum',
          slug: 'two-sum',
          url: 'https://leetcode.com/problems/two-sum/',
          difficulty: 'Easy',
          paidOnly: false,
          available: true,
          tags: ['array'],
        },
      ],
      items: [{ skillSlug: 'arrays', providerId: '1', position: 1 }],
    },
    0n,
  );
  await study.replenish();
  const before = await study.recommendations();
  const recommendation = before.items[0]!;
  const skill = await client.skill.findFirstOrThrow({ where: { slug: 'arrays' } });
  const catalogRevision = await study.currentCatalogRevision();
  await expect(
    study.acceptDiscoveryPage(
      {
        skill: {
          slug: skill.slug,
          name: skill.name,
          tags: skill.tags,
          mappingVersion: skill.mappingVersion,
          active: skill.active,
        },
        skillId: skill.id,
        difficulty: 'Easy',
        fingerprint: 'invalid-page-v1',
        scanId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        offset: 0,
        catalogRevision,
        configVersion: defaultConfig.version,
        generation: before.generation,
        userSourceSequence: (await client.localUser.findFirstOrThrow()).sourceSequence,
      },
      { problems: [], offset: 0, nextOffset: 0, total: 1, exhausted: true },
    ),
  ).rejects.toMatchObject({ code: 'INVALID_DISCOVERY_PAGE' });
  await study.acceptDiscoveryPage(
    {
      skill: {
        slug: skill.slug,
        name: skill.name,
        tags: skill.tags,
        mappingVersion: skill.mappingVersion,
        active: skill.active,
      },
      skillId: skill.id,
      difficulty: 'Easy',
      fingerprint: discoveryFingerprint(skill, 'Easy', defaultConfig),
      scanId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      offset: 0,
      catalogRevision,
      configVersion: defaultConfig.version,
      generation: before.generation,
      userSourceSequence: (await client.localUser.findFirstOrThrow()).sourceSequence,
    },
    {
      problems: [
        {
          provider: 'leetcode',
          providerId: '1',
          frontendId: '1',
          title: 'Two Sum',
          slug: 'two-sum',
          url: 'https://leetcode.com/problems/two-sum/',
          difficulty: 'Easy',
          paidOnly: true,
          available: true,
          tags: ['array'],
        },
      ],
      offset: 0,
      nextOffset: 1,
      total: 1,
      exhausted: true,
    },
  );
  expect(
    await client.recommendation.findUniqueOrThrow({ where: { id: recommendation.id } }),
  ).toMatchObject({ status: 'INVALIDATED' });
  expect(
    await client.recommendationEvent.findFirst({
      where: { recommendationId: recommendation.id, kind: 'INVALIDATED' },
    }),
  ).not.toBeNull();
  expect(
    await client.workRequest.count({
      where: { status: 'PENDING', kind: 'REFILL' },
    }),
  ).toBeGreaterThan(0);
  const payload = {
    recommendationId: recommendation.id,
    generation: before.generation,
    feedbackSchemaVersion: 'feedback-v1' as const,
    answers: {
      independence: 'INDEPENDENT' as const,
      recognition: 'INDEPENDENT' as const,
      implementation: 'UNABLE' as const,
      complexity: 'CORRECT' as const,
    },
    durationSeconds: 0,
    timezone: 'America/Sao_Paulo',
  };
  const created = await study.complete(payload, 'one-attempt');
  expect(created.status).toBe(201);
  expect(created.body.attempt).toMatchObject({ rating: 'AGAIN', durationSeconds: 0 });
  expect(
    await client.recommendation.findUniqueOrThrow({ where: { id: recommendation.id } }),
  ).toMatchObject({ status: 'COMPLETED' });
  await study.discoveryNeeds();
  await study.replenish();
  expect((await study.recommendations()).items).toHaveLength(0);
  expect(await study.analytics({ timezone: 'America/Sao_Paulo' })).toMatchObject({
    totalAttempts: 1,
    uniqueProblems: 1,
  });
  const replay = await study.complete(payload, 'one-attempt');
  expect(replay.status).toBe(200);
  expect(replay.body.attempt).toEqual(created.body.attempt);
  await expect(
    study.complete({ ...payload, durationSeconds: 1 }, 'one-attempt'),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_PAYLOAD_CHANGED' });
  expect(await client.attempt.count()).toBe(1);
  expect(await client.skillMemoryState.count()).toBe(1);
  expect(await client.workRequest.count({ where: { status: 'PENDING' } })).toBeGreaterThan(0);
  const expectedMemory = await client.skillMemoryState.findFirstOrThrow();
  const expectedCooldown = await client.userProblemState.findFirstOrThrow();
  await client.skillMemoryState.deleteMany();
  await client.userProblemState.deleteMany();
  await study.rebuildProjections();
  expect((await client.skillMemoryState.findFirstOrThrow()).state).toEqual(expectedMemory.state);
  expect(await client.userProblemState.findFirstOrThrow()).toMatchObject({
    problemId: expectedCooldown.problemId,
    completionCount: expectedCooldown.completionCount,
    cooldownUntil: expectedCooldown.cooldownUntil,
  });

  const earlierStudy = new PrismaStudyService(
    client,
    transactions,
    { now: () => new Date('2026-01-01T12:00:00.000Z') },
    new FsrsMemoryEngine(),
    new NoOpLogger(),
  );
  await expect(earlierStudy.reset(before.generation)).rejects.toMatchObject({
    code: 'CLOCK_REGRESSION',
  });

  const globalBefore = {
    problems: await client.problem.count(),
    configurations: await client.configuration.count(),
    catalogRevisions: await client.catalogRevision.count(),
  };
  const reset = await study.reset(before.generation);
  expect(reset.generation).not.toBe(before.generation);
  expect(await client.attempt.count()).toBe(0);
  expect(await client.recommendation.count()).toBe(0);
  expect(await client.skillMemoryState.count()).toBe(0);
  expect({
    problems: await client.problem.count(),
    configurations: await client.configuration.count(),
    catalogRevisions: await client.catalogRevision.count(),
  }).toEqual(globalBefore);
  await expect(study.complete(payload, 'one-attempt')).rejects.toMatchObject({
    code: 'STALE_GENERATION',
  });
});

test('configuration activation preserves versions, coalesces duplicate activation and rejects rewritten history', async () => {
  const repository = new PrismaConfigurationRepository(transactions);
  const clock = { now: () => new Date('2026-01-03T12:00:00Z') };
  const updated = {
    ...defaultConfig,
    version: 'acceptance-v2',
    scheduler: { ...defaultConfig.scheduler, queueSize: 3 },
  };
  const before = await client.configurationActivation.count();
  await Promise.all([
    activateConfiguration(updated, repository, clock),
    activateConfiguration(updated, repository, clock),
  ]);
  expect(await client.configurationActivation.count()).toBe(before + 1);
  expect(await client.configuration.count({ where: { version: defaultConfig.version } })).toBe(1);
  await expect(
    activateConfiguration(
      { ...updated, scheduler: { ...updated.scheduler, queueSize: 4 } },
      repository,
      clock,
    ),
  ).rejects.toMatchObject({ code: 'CONFIGURATION_VERSION_CONFLICT' });
  const study = new PrismaStudyService(
    client,
    transactions,
    clock,
    new FsrsMemoryEngine(),
    new NoOpLogger(),
  );
  expect((await study.activeConfiguration()).version).toBe(updated.version);
  await expect(study.replenish(defaultConfig.version)).rejects.toMatchObject({
    code: 'STALE_CONFIGURATION',
  });
});
