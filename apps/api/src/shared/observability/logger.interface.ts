export interface Logger {
  event(name: string, fields?: Readonly<Record<string, unknown>>): void;
  error(name: string, fields?: Readonly<Record<string, unknown>>): void;
}
export interface Telemetry {
  measure(name: string, value: number, fields?: Readonly<Record<string, string>>): void;
}
export class NoOpLogger implements Logger {
  event(): void {
    /* Deliberate test/no-op adapter. */
  }
  error(): void {
    /* Deliberate test/no-op adapter. */
  }
}
export class NoOpTelemetry implements Telemetry {
  measure(): void {
    /* No external telemetry requirement in MVP. */
  }
}
