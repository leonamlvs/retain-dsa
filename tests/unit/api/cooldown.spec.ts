import { cooldownUntil } from '../../../apps/api/src/modules/memory/cooldown.js';
import { FsrsMemoryEngine } from '../../../apps/api/src/infrastructure/fsrs-memory-engine.js';
import { defaultConfig } from '../../../apps/api/src/config/default-config.js';
import { DAY_MS } from '../../../apps/api/src/domain/calendar.js';
const at = new Date('2026-01-01T00:00:00Z');
test.each([
  [1, 30],
  [20, 60],
  [100, 180],
])('clamps a %i day interval to %i cooldown days', (interval, expected) => {
  const memory = new FsrsMemoryEngine().review(undefined, 'GOOD', at, defaultConfig);
  memory.due = new Date(at.getTime() + interval * DAY_MS).toISOString();
  expect(cooldownUntil(memory, at, defaultConfig)).toBe(
    new Date(at.getTime() + expected * DAY_MS).toISOString(),
  );
});
