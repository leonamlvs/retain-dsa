import { PrismaPg } from '@prisma/adapter-pg';

/** Prisma may fan out relation reads within one transaction; pg connections require serialization. */
export class SerialPrismaPg extends PrismaPg {
  override async connect() {
    const adapter = await super.connect();
    const startTransaction = adapter.startTransaction.bind(adapter);
    adapter.startTransaction = async (...args) => {
      const transaction = await startTransaction(...args);
      let tail = Promise.resolve();
      const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
        const result = tail.then(operation);
        tail = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      };
      const queryRaw = transaction.queryRaw.bind(transaction);
      const executeRaw = transaction.executeRaw.bind(transaction);
      transaction.queryRaw = (query) => serialize(() => queryRaw(query));
      transaction.executeRaw = (query) => serialize(() => executeRaw(query));
      return transaction;
    };
    return adapter;
  }
}
