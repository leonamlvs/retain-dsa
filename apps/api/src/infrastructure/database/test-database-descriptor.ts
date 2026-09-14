import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { z } from 'zod';
import { DomainError } from '../../domain/domain-error.js';
const descriptorSchema = z
  .object({
    kind: z.literal('retain-testcontainers-v1'),
    runId: z.string().uuid(),
    containerId: z.string().regex(/^[a-f0-9]{64}$/),
    host: z.enum(['localhost', '127.0.0.1', '::1']),
    port: z.number().int().min(1024).max(65535),
    database: z.string().regex(/^retain_test_[a-f0-9]{32}$/),
    username: z.string().regex(/^retain_test_[a-f0-9]{32}$/),
    password: z.string().regex(/^[a-f0-9]{64}$/),
    token: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type TestDatabaseDescriptor = z.infer<typeof descriptorSchema>;
function denied(): never {
  throw new DomainError(
    'UNSAFE_TEST_DATABASE',
    'A valid descriptor issued by the disposable database harness is required before connecting.',
  );
}
export function validateTestDescriptor(input: unknown): TestDatabaseDescriptor {
  const parsed = descriptorSchema.safeParse(input);
  if (!parsed.success) return denied();
  const expected = `retain_test_${parsed.data.runId.replaceAll('-', '')}`;
  if (parsed.data.database !== expected || parsed.data.username !== expected) return denied();
  return parsed.data;
}
export async function readTestDescriptor(
  environment: NodeJS.ProcessEnv,
  root: string,
): Promise<TestDatabaseDescriptor> {
  if (
    environment.NODE_ENV !== 'test' ||
    environment.DATABASE_URL ||
    environment.DIRECT_URL ||
    environment.PGHOST ||
    environment.PGDATABASE ||
    environment.PGUSER ||
    environment.PGPASSWORD ||
    environment.PGSERVICE ||
    environment.PGSERVICEFILE
  )
    return denied();
  const runId = z.string().uuid().safeParse(environment.RETAIN_TEST_RUN_ID);
  if (!runId.success || !environment.RETAIN_TEST_TOKEN) return denied();
  const directory = resolve(root, '.test-runs');
  const path = resolve(directory, runId.data, 'database.json');
  const relation = relative(directory, path);
  if (relation.startsWith('..') || isAbsolute(relation)) return denied();
  try {
    const descriptor = validateTestDescriptor(JSON.parse(await readFile(path, 'utf8')));
    const actual = Buffer.from(environment.RETAIN_TEST_TOKEN);
    const expected = Buffer.from(descriptor.token);
    if (
      descriptor.runId !== runId.data ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      return denied();
    return descriptor;
  } catch {
    return denied();
  }
}
export function testConnectionUrl(descriptor: TestDatabaseDescriptor): string {
  const checked = validateTestDescriptor(descriptor);
  const host = checked.host === '::1' ? '[::1]' : checked.host;
  return `postgresql://${checked.username}:${checked.password}@${host}:${checked.port}/${checked.database}`;
}
