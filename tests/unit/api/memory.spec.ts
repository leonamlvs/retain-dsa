import { FsrsMemoryEngine } from '../../../apps/api/src/infrastructure/fsrs-memory-engine.js';
import { defaultConfig } from '../../../apps/api/src/config/default-config.js';
import { DAY_MS } from '../../../apps/api/src/domain/calendar.js';
const engine = new FsrsMemoryEngine();
const at = new Date('2026-01-01T00:00:00.000Z');
test('pinned adapter serializes a reproducible complete initial transition', () => {
  const state = engine.review(undefined, 'GOOD', at, defaultConfig);
  expect(state).toMatchObject({
    stability: 2.3065,
    reps: 1,
    lapses: 0,
    state: 2,
    lastReview: at.toISOString(),
    adapterVersion: 'ts-fsrs-5.4.2-v1',
  });
  const next = new Date(at.getTime() + DAY_MS * 5);
  expect(engine.review(JSON.parse(JSON.stringify(state)), 'HARD', next, defaultConfig)).toEqual(
    engine.review(state, 'HARD', next, defaultConfig),
  );
  expect(engine.retention(state, at, defaultConfig)).toBe(1);
});
test('allows equal-time reviews but rejects backwards transitions and absent historical versions', () => {
  const state = engine.review(undefined, 'GOOD', at, defaultConfig);
  expect(engine.review(state, 'GOOD', at, defaultConfig).reps).toBe(2);
  expect(() => engine.review(state, 'GOOD', new Date(at.getTime() - 1), defaultConfig)).toThrow(
    'precedes',
  );
  expect(() => engine.retention(state, at, { ...defaultConfig, version: 'missing' })).toThrow(
    'original',
  );
});
test('finds the first strictly regressed millisecond independent of observation frequency', () => {
  const state = engine.review(undefined, 'GOOD', at, defaultConfig);
  const end = new Date(at.getTime() + 365 * DAY_MS);
  const boundary = engine.firstBelow(state, 0.5, at, end, defaultConfig)!;
  expect(boundary).not.toBeNull();
  expect(engine.retention(state, boundary, defaultConfig)).toBeLessThan(0.5);
  expect(
    engine.retention(state, new Date(boundary.getTime() - 1), defaultConfig),
  ).toBeGreaterThanOrEqual(0.5);
  expect(
    engine.firstBelow(state, 0.5, at, new Date(boundary.getTime() - 1), defaultConfig),
  ).toBeNull();
  expect(
    engine.firstBelow(state, 0.5, at, new Date(end.getTime() + DAY_MS), defaultConfig),
  ).toEqual(boundary);
});
