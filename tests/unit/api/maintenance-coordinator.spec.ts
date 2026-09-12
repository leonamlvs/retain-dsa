import {
  MaintenanceCoordinator,
  type MaintenanceStudyService,
} from '../../../apps/api/src/application/maintenance-coordinator.js';
import { defaultConfig } from '../../../apps/api/src/config/default-config.js';
import type { DiscoveryNeed } from '../../../apps/api/src/modules/discovery/discovery-need.interface.js';
import type { ProblemProvider } from '../../../apps/api/src/modules/discovery/problem-provider.interface.js';
import type { DiscoveryCriteria } from '../../../apps/api/src/modules/discovery/problem-provider.interface.js';
import { NoOpLogger } from '../../../apps/api/src/shared/observability/logger.interface.js';

const need: DiscoveryNeed = {
  skill: {
    slug: 'binary-search',
    name: 'Binary Search',
    tags: ['binary-search'],
    mappingVersion: 'leetcode75-tags-v1',
    active: true,
  },
  skillId: 'skill-id',
  difficulty: 'Easy',
  fingerprint: 'fingerprint',
  scanId: '11111111-1111-4111-8111-111111111111',
  offset: 0,
  catalogRevision: 1n,
  configVersion: defaultConfig.version,
  generation: 'test-generation',
  userSourceSequence: 0n,
};

test('does no provider work when persisted discovery needs are already adequate', async () => {
  const study: MaintenanceStudyService = {
    rebuildProjections: jest.fn(async () => undefined),
    discoveryNeeds: async () => [],
    currentCatalogRevision: async () => 1n,
    cachedSupply: async () => 25,
    acceptDiscoveryPage: async () => need,
    replenish: jest.fn(async () => undefined),
  };
  const provider: ProblemProvider = {
    curriculum: jest.fn<ProblemProvider['curriculum']>(),
    discover: jest.fn<ProblemProvider['discover']>(),
  };
  await new MaintenanceCoordinator(
    study,
    provider,
    { now: () => new Date('2026-01-01T00:00:00Z') },
    defaultConfig,
    new NoOpLogger(),
  ).run();
  expect(provider.discover).not.toHaveBeenCalled();
  expect(study.replenish).toHaveBeenCalledTimes(1);
});

test('persists complete discovery before ranking and replenishes after provider failure', async () => {
  let revision = 1n;
  let accepted = 0;
  const study: MaintenanceStudyService = {
    rebuildProjections: jest.fn(async () => undefined),
    discoveryNeeds: async () => [need],
    currentCatalogRevision: async () => revision,
    cachedSupply: async () => accepted,
    acceptDiscoveryPage: async (current, page) => {
      accepted += page.problems.length;
      revision += 1n;
      return { ...current, offset: page.nextOffset, catalogRevision: revision };
    },
    replenish: jest.fn(async () => undefined),
  };
  const provider: ProblemProvider = {
    curriculum: jest.fn<ProblemProvider['curriculum']>(),
    discover: jest
      .fn<ProblemProvider['discover']>()
      .mockResolvedValueOnce({ problems: [], offset: 0, nextOffset: 0, total: 0, exhausted: true }),
  };
  await new MaintenanceCoordinator(
    study,
    provider,
    { now: () => new Date('2026-01-01T00:00:00Z') },
    defaultConfig,
    new NoOpLogger(),
  ).run();
  expect(provider.discover).toHaveBeenCalledTimes(1);
  expect(study.replenish).toHaveBeenCalledTimes(1);

  provider.discover = jest.fn(async () => {
    throw new Error('offline');
  });
  await new MaintenanceCoordinator(
    study,
    provider,
    { now: () => new Date('2026-01-01T00:00:00Z') },
    defaultConfig,
    new NoOpLogger(),
  ).run();
  expect(study.replenish).toHaveBeenCalledTimes(2);
});

test('restarts a changed provider scan within the same bounded operation', async () => {
  let accepted = 0;
  const study: MaintenanceStudyService = {
    rebuildProjections: async () => undefined,
    discoveryNeeds: async () => [need],
    currentCatalogRevision: async () => 1n,
    cachedSupply: async () => 0,
    acceptDiscoveryPage: async (current, page) => {
      accepted += 1;
      return accepted === 1
        ? {
            ...current,
            scanId: '22222222-2222-4222-8222-222222222222',
            offset: 0,
            restartRequired: true,
          }
        : { ...current, offset: page.nextOffset, restartRequired: false };
    },
    replenish: async () => undefined,
  };
  const provider: ProblemProvider = {
    curriculum: jest.fn<ProblemProvider['curriculum']>(),
    discover: jest.fn(async (criteria: DiscoveryCriteria) => ({
      problems: [],
      offset: criteria.offset,
      nextOffset: criteria.offset,
      total: 0,
      exhausted: true,
    })),
  };
  await new MaintenanceCoordinator(
    study,
    provider,
    { now: () => new Date('2026-01-01T00:00:00Z') },
    defaultConfig,
    new NoOpLogger(),
  ).run();
  expect(provider.discover).toHaveBeenCalledTimes(2);
});
import { jest } from '@jest/globals';

test('one need retains its deadline across pages and drain stops new admission', async () => {
  let time = Date.parse('2026-01-01T00:00:00Z');
  const deadlines: number[] = [];
  const study: MaintenanceStudyService = {
    rebuildProjections: async () => undefined,
    discoveryNeeds: async () => [need],
    currentCatalogRevision: async () => 1n,
    cachedSupply: async () => 0,
    acceptDiscoveryPage: async (current, page) => ({ ...current, offset: page.nextOffset }),
    replenish: jest.fn(async () => undefined),
  };
  const provider: ProblemProvider = {
    curriculum: jest.fn<ProblemProvider['curriculum']>(),
    discover: jest.fn<ProblemProvider['discover']>(async (criteria, deadline) => {
      deadlines.push(deadline.getTime());
      time += 8000;
      return {
        problems: [],
        offset: criteria.offset,
        nextOffset: criteria.offset + 1,
        total: 100,
        exhausted: false,
      };
    }),
  };
  const coordinator = new MaintenanceCoordinator(
    study,
    provider,
    { now: () => new Date(time) },
    defaultConfig,
    new NoOpLogger(),
  );
  await coordinator.run();
  expect(deadlines).toHaveLength(2);
  expect(new Set(deadlines).size).toBe(1);
  await coordinator.drain();
  await coordinator.run();
  expect(provider.discover).toHaveBeenCalledTimes(2);
});
