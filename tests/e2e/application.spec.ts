import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { test, expect } from '@playwright/test';
import type { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';
import { DatabaseHarness } from '../support/database-harness.js';
import {
  connectTestDatabase,
  migrateTestDatabase,
  seedTestDatabase,
} from '../support/test-database.js';
import { PrismaTransactions } from '../../apps/api/src/infrastructure/database/prisma-transactions.js';
import { PrismaStudyService } from '../../apps/api/src/infrastructure/database/prisma-study-service.js';
import { FsrsMemoryEngine } from '../../apps/api/src/infrastructure/fsrs-memory-engine.js';
import { NoOpLogger } from '../../apps/api/src/shared/observability/logger.interface.js';
import { createApp } from '../../apps/api/src/http/create-app.js';
import { createRuntimeServer } from '../../apps/api/src/http/runtime-server.js';

let harness: DatabaseHarness;
let client: PrismaClient;
let server: Server;
let closeWeb: () => Promise<void>;
let baseUrl: string;
let study: PrismaStudyService;
const backgroundTasks = new Set<Promise<void>>();
const backgroundErrors: unknown[] = [];

test.beforeAll(async () => {
  harness = await DatabaseHarness.start();
  await migrateTestDatabase(harness.environment);
  await seedTestDatabase(harness.environment, new Date('2026-09-12T09:00:00Z'));
  client = await connectTestDatabase(harness.environment);
  const transactions = new PrismaTransactions(client);
  study = new PrismaStudyService(
    client,
    transactions,
    { now: () => new Date('2026-09-12T12:00:00Z') },
    new FsrsMemoryEngine(),
    new NoOpLogger(),
  );
  await study.acceptCurriculum(
    {
      slug: 'leetcode-75',
      name: 'LeetCode 75',
      skills: [
        {
          slug: 'binary-search',
          name: 'Binary Search',
          tags: ['binary-search'],
          mappingVersion: 'leetcode75-tags-v1',
          active: true,
        },
      ],
      problems: [
        {
          provider: 'leetcode',
          providerId: '33',
          frontendId: '33',
          title: 'Search in Rotated Sorted Array',
          slug: 'search-in-rotated-sorted-array',
          url: 'https://leetcode.com/problems/search-in-rotated-sorted-array/',
          difficulty: 'Medium',
          paidOnly: false,
          available: true,
          tags: ['binary-search', 'array'],
        },
      ],
      items: [{ skillSlug: 'binary-search', providerId: '33', position: 1 }],
    },
    0n,
  );
  await study.replenish();
  const app = createApp(
    study,
    new NoOpLogger(),
    () => 'available',
    () => {
      const task = study.replenish().catch((error: unknown) => {
        backgroundErrors.push(error);
      });
      backgroundTasks.add(task);
      void task.finally(() => backgroundTasks.delete(task));
    },
  );
  const runtime = await createRuntimeServer(app, { mode: 'development' });
  server = runtime.server;
  closeWeb = runtime.closeWeb;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  await Promise.all(backgroundTasks);
  await closeWeb?.();
  await client?.$disconnect();
  await harness?.stop();
  expect(backgroundErrors).toEqual([]);
});

test.describe.serial('isolated local application', () => {
  test('recovers corrupted storage without blocking read-only study', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('retain-dsa.state.v1', '{broken');
      localStorage.setItem('retain-dsa.timer.v1', '{broken');
    });
    await page.goto(`${baseUrl}/challenges`);
    await expect(page.getByText('Search in Rotated Sorted Array')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start' })).toBeEnabled();
  });
  test('loads one-origin UI and cancellation keeps the running timer', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        'retain-dsa.state.v1',
        JSON.stringify({ generation: 'obsolete-database', stateRevision: '999999999' }),
      ),
    );
    await page.goto(`${baseUrl}/challenges`);
    await expect(page.getByRole('heading', { name: 'Retain DSA' })).toBeVisible();
    await expect(page.getByText('Search in Rotated Sorted Array')).toBeVisible();
    await page.getByRole('button', { name: 'Start' }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await page.getByRole('button', { name: 'Complete' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    expect(await client.attempt.count()).toBe(0);
  });

  test('saves feedback, renders analytics, and resets only user data', async ({ page }) => {
    await page.goto(`${baseUrl}/challenges`);
    await page.getByRole('button', { name: 'Complete' }).click();
    await page.getByRole('button', { name: 'Save attempt' }).click();
    await expect.poll(() => client.attempt.count()).toBe(1);
    await page.getByRole('link', { name: 'Analytics' }).click();
    await expect(
      page
        .getByRole('article')
        .filter({ has: page.getByText('Attempts', { exact: true }) })
        .getByText('1', { exact: true }),
    ).toBeVisible();
    const globalBefore = {
      problems: await client.problem.count(),
      configurations: await client.configuration.count(),
    };
    await page.getByRole('button', { name: 'Reset progress' }).click();
    await page.getByLabel(/Type/).fill('RESET');
    await page.getByRole('button', { name: 'Delete progress' }).click();
    await expect.poll(() => client.attempt.count()).toBe(0);
    expect({
      problems: await client.problem.count(),
      configurations: await client.configuration.count(),
    }).toEqual(globalBefore);
  });

  test('another tab reconciles reset and discards its old timer and draft', async ({
    page,
    context,
  }) => {
    await page.goto(`${baseUrl}/challenges`);
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: 'Complete' }).click();
    const other = await context.newPage();
    await other.goto(`${baseUrl}/challenges`);
    await other.getByRole('button', { name: 'Reset progress' }).click();
    await other.getByLabel(/Type/).fill('RESET');
    await other.getByRole('button', { name: 'Delete progress' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('retain-dsa.timer.v1'))).toBeNull();
    await other.close();
  });

  test('reload recovers a retired issuance and allows its original completion', async ({
    page,
  }) => {
    await page.goto(`${baseUrl}/challenges`);
    await page.getByRole('button', { name: 'Start' }).click();
    const need = (await study.discoveryNeeds()).find((item) => item.difficulty === 'Medium')!;
    await study.acceptDiscoveryPage(need, {
      problems: [
        {
          provider: 'leetcode',
          providerId: '33',
          frontendId: '33',
          title: 'Search in Rotated Sorted Array',
          slug: 'search-in-rotated-sorted-array',
          url: 'https://leetcode.com/problems/search-in-rotated-sorted-array/',
          difficulty: 'Medium',
          paidOnly: true,
          available: true,
          tags: ['binary-search', 'array'],
        },
      ],
      offset: 0,
      nextOffset: 1,
      total: 1,
      exhausted: true,
    });
    await page.reload();
    await expect(
      page.getByText('In-progress attempt recovered from the original issuance.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Complete' }).click();
    await page.getByRole('button', { name: 'Save attempt' }).click();
    await expect.poll(() => client.attempt.count()).toBe(1);
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});
