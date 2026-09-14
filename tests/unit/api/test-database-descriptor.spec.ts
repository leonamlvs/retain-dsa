import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readTestDescriptor,
  validateTestDescriptor,
} from '../../../apps/api/src/infrastructure/database/test-database-descriptor.js';
import { sanitizedTestEnvironment } from '../../support/database-harness.js';
const runId = randomUUID();
const identity = `retain_test_${runId.replaceAll('-', '')}`;
const descriptor = {
  kind: 'retain-testcontainers-v1',
  runId,
  containerId: 'a'.repeat(64),
  host: '127.0.0.1',
  port: 54321,
  database: identity,
  username: identity,
  password: 'b'.repeat(64),
  token: 'c'.repeat(64),
};
test.each([
  undefined,
  {},
  { ...descriptor, database: 'personal' },
  { ...descriptor, host: 'production.example' },
  { ...descriptor, containerId: '' },
])('rejects unowned connection targets', (input) =>
  expect(() => validateTestDescriptor(input)).toThrow('descriptor'),
);
test('sanitizes child processes and checks receipt/token before any connection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'retain-guard-'));
  const directory = join(root, '.test-runs', runId);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'database.json'), JSON.stringify(descriptor));
  // This conflict must never be loaded, even when present alongside a valid receipt.
  await writeFile(join(root, '.env'), 'DATABASE_URL=postgresql://personal/retain');
  try {
    const env = sanitizedTestEnvironment(
      {
        DATABASE_URL: 'postgresql://personal/retain',
        PGHOST: 'personal',
        NODE_OPTIONS: '--require=dotenv/config',
        PATH: '/bin',
      },
      validateTestDescriptor(descriptor),
    );
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(await readTestDescriptor(env, root)).toEqual(descriptor);
    await expect(
      readTestDescriptor({ ...env, DATABASE_URL: 'postgresql://personal/retain' }, root),
    ).rejects.toMatchObject({ code: 'UNSAFE_TEST_DATABASE' });
    await expect(
      readTestDescriptor({ ...env, RETAIN_TEST_TOKEN: 'wrong' }, root),
    ).rejects.toMatchObject({ code: 'UNSAFE_TEST_DATABASE' });
    await expect(readTestDescriptor({}, root)).rejects.toMatchObject({
      code: 'UNSAFE_TEST_DATABASE',
    });
  } finally {
    await unlink(join(directory, 'database.json'));
    await unlink(join(root, '.env'));
    await rmdir(directory);
    await rmdir(join(root, '.test-runs'));
    await rmdir(root);
  }
});
