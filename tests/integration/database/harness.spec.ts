import { Client } from 'pg';
import { DatabaseHarness } from '../../support/database-harness.js';
import {
  readTestDescriptor,
  testConnectionUrl,
} from '../../../apps/api/src/infrastructure/database/test-database-descriptor.js';
test('provisions, connects only through a validated receipt, and tears down the owned container', async () => {
  const harness = await DatabaseHarness.start();
  try {
    const descriptor = await readTestDescriptor(harness.environment, process.cwd());
    const client = new Client({ connectionString: testConnectionUrl(descriptor) });
    try {
      await client.connect();
      const result = await client.query<{ database: string; username: string }>(
        'SELECT current_database() AS database, current_user AS username',
      );
      expect(result.rows[0]).toEqual({
        database: descriptor.database,
        username: descriptor.username,
      });
    } finally {
      await client.end();
    }
  } finally {
    await harness.stop();
  }
}, 120000);
