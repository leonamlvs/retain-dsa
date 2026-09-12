import { setTimeout } from 'node:timers/promises';
import type { Clock, Sleeper } from '../domain/clock.interface.js';
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
export class SystemSleeper implements Sleeper {
  async sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
    await setTimeout(milliseconds, undefined, signal ? { signal } : {});
  }
}
