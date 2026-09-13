import { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { DomainError } from '../../domain/domain-error.js';
import type { TransactionRunner } from '../../domain/transaction.interface.js';
export interface DatabaseScope {
  readonly db: Prisma.TransactionClient;
}
export class PrismaTransactions implements TransactionRunner<DatabaseScope, DatabaseScope> {
  constructor(private readonly client: PrismaClient) {}
  async write<T>(operation: (scope: DatabaseScope) => Promise<T>): Promise<T> {
    return this.serializedWrite(operation, 15000);
  }
  async maintenance<T>(operation: (scope: DatabaseScope) => Promise<T>): Promise<T> {
    return this.serializedWrite(operation, 60000);
  }
  private async serializedWrite<T>(
    operation: (scope: DatabaseScope) => Promise<T>,
    timeout: number,
  ): Promise<T> {
    return this.client.$transaction(
      async (db) => {
        const rows = await db.$queryRaw<
          { id: number }[]
        >`SELECT id FROM "ApplicationState" WHERE id = 1 FOR UPDATE`;
        if (rows.length !== 1)
          throw new DomainError(
            'DATABASE_NOT_INITIALIZED',
            'The application state root is missing.',
          );
        return operation({ db });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5000,
        timeout,
      },
    );
  }
  async read<T>(operation: (scope: DatabaseScope) => Promise<T>): Promise<T> {
    return this.client.$transaction(
      async (db) => {
        await db.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        return operation({ db });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 },
    );
  }
}
