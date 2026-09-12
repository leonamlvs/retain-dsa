import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink, rmdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  readTestDescriptor,
  validateTestDescriptor,
  type TestDatabaseDescriptor,
} from '../../apps/api/src/infrastructure/database/test-database-descriptor.js';
export function sanitizedTestEnvironment(
  parent: NodeJS.ProcessEnv,
  descriptor: TestDatabaseDescriptor,
): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(parent)) {
    if (/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE)$/i.test(key))
      result[key] = value;
  }
  return {
    ...result,
    NODE_ENV: 'test',
    RETAIN_TEST_RUN_ID: descriptor.runId,
    RETAIN_TEST_TOKEN: descriptor.token,
  };
}
export class DatabaseHarness {
  private constructor(
    readonly descriptor: TestDatabaseDescriptor,
    readonly environment: NodeJS.ProcessEnv,
    private readonly container: StartedPostgreSqlContainer,
    private readonly root: string,
  ) {}
  static async start(root = process.cwd()): Promise<DatabaseHarness> {
    const runId = randomUUID();
    const identity = `retain_test_${runId.replaceAll('-', '')}`;
    const password = randomBytes(32).toString('hex');
    let container: StartedPostgreSqlContainer | undefined;
    try {
      container = await new PostgreSqlContainer('postgres:17.6-alpine')
        .withDatabase(identity)
        .withUsername(identity)
        .withPassword(password)
        .withLabels({ 'retain.test-run': runId })
        .start();
      const descriptor = validateTestDescriptor({
        kind: 'retain-testcontainers-v1',
        runId,
        containerId: container.getId(),
        host: container.getHost(),
        port: container.getPort(),
        database: identity,
        username: identity,
        password,
        token: randomBytes(32).toString('hex'),
      });
      const directory = resolve(root, '.test-runs', runId);
      await mkdir(directory, { recursive: true });
      await writeFile(resolve(directory, 'database.json'), JSON.stringify(descriptor), {
        flag: 'wx',
        mode: 0o600,
      });
      return new DatabaseHarness(
        descriptor,
        sanitizedTestEnvironment(process.env, descriptor),
        container,
        root,
      );
    } catch (error) {
      await container?.stop();
      throw new Error(
        'Disposable PostgreSQL could not start. Docker is required; no development database fallback is permitted.',
        { cause: error },
      );
    }
  }
  async stop(): Promise<void> {
    // Validate ownership again before teardown; target only the handle created by this run.
    const descriptor = await readTestDescriptor(this.environment, this.root);
    if (descriptor.containerId !== this.container.getId())
      throw new Error('Test container ownership changed.');
    await this.container.stop();
    const directory = resolve(this.root, '.test-runs', descriptor.runId);
    await unlink(resolve(directory, 'database.json'));
    await rmdir(directory);
  }
}
