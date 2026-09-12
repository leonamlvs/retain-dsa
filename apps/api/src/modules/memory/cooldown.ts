import type { StudyConfig } from '../../config/study-config.schema.js';
import { DAY_MS, assertInstant } from '../../domain/calendar.js';
import type { MemoryState } from './memory-engine.interface.js';
export function cooldownUntil(memory: MemoryState, completedAt: Date, config: StudyConfig): string {
  const interval = Math.max(
    0,
    assertInstant(memory.due).getTime() - assertInstant(completedAt).getTime(),
  );
  const { cooldownMultiplier, minimumCooldownDays, maximumCooldownDays } = config.scheduler;
  const elapsed = Math.min(
    maximumCooldownDays * DAY_MS,
    Math.max(minimumCooldownDays * DAY_MS, interval * cooldownMultiplier),
  );
  return new Date(completedAt.getTime() + elapsed).toISOString();
}
