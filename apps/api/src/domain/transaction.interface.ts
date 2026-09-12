export interface StateRevision {
  stateRevision: string;
  catalogRevision: string;
  generation: string;
  configVersion: string;
}
/** The implementation acquires the canonical write lock before creating the scope. */
export interface TransactionRunner<WriteScope, ReadScope> {
  write<T>(operation: (scope: WriteScope) => Promise<T>): Promise<T>;
  read<T>(operation: (scope: ReadScope) => Promise<T>): Promise<T>;
}
