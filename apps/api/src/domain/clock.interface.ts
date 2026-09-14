export interface Clock {
  now(): Date;
}
export interface Sleeper {
  sleep(milliseconds: number, signal?: AbortSignal): Promise<void>;
}
