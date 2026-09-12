export class DomainError extends Error {
  public state?: { generation: string; stateRevision: string };
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
