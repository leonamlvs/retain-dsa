import fc from 'fast-check';
import {
  evaluateQueue,
  serializeQueueInput,
} from '../../../apps/api/src/modules/scheduler/queue-engine.js';
import type { QueueInput } from '../../../apps/api/src/modules/scheduler/queue-input.schema.js';
import { defaultConfig } from '../../../apps/api/src/config/default-config.js';
import { FsrsMemoryEngine } from '../../../apps/api/src/infrastructure/fsrs-memory-engine.js';

const memory = new FsrsMemoryEngine();
const now = new Date('2026-09-12T12:00:00Z');
function input(size: number, flags: { paidOnly: boolean; available: boolean }[]): QueueInput {
  const config = { ...defaultConfig, scheduler: { ...defaultConfig.scheduler, queueSize: size } };
  const skill = {
    id: 'arrays',
    slug: 'arrays',
    name: 'Arrays',
    tags: ['array'],
    mappingVersion: 'leetcode75-tags-v1',
    active: true,
  };
  const problems = flags.map((flag, i) => ({
    id: String(i),
    provider: 'leetcode',
    providerProblemId: String(i),
    frontendId: String(i),
    title: `Problem ${i}`,
    slug: `problem-${i}`,
    url: `https://leetcode.com/problems/problem-${i}/`,
    difficulty: 'Easy' as const,
    ...flag,
    tags: [{ tag: 'array' }],
  }));
  return {
    version: 'queue-input-v1',
    evaluatedAt: now,
    config,
    configurations: [{ activatedAt: '2026-01-01T00:00:00Z', config }],
    problems,
    items: problems.map((problem, position) => ({
      id: `item-${position}`,
      problemId: problem.id,
      skillId: skill.id,
      position,
      problem,
      skill,
    })),
    attempts: [],
    issuances: [],
    certificates: [],
  };
}

test('whole-queue reservation fills two progression slots beside three survivors', () => {
  const raw = input(
    5,
    Array.from({ length: 8 }, () => ({ paidOnly: false, available: true })),
  );
  raw.issuances = raw.problems.slice(0, 3).map((p, position) => ({
    id: `issuance-${p.id}`,
    problemId: p.id,
    skillId: 'arrays',
    difficulty: 'Easy',
    status: 'ACTIVE',
    position,
    issuedAt: now,
    admissionBasis: { reason: 'REVIEW', eligibility: { kind: 'BASE_DIFFICULTY' } },
  }));
  const result = evaluateQueue(raw, memory);
  expect(result.surviving).toHaveLength(3);
  expect(result.selectedRanked).toHaveLength(2);
  expect(result.selectedRanked.every((candidate) => candidate.needReason === 'PROGRESSION')).toBe(
    true,
  );
  expect(result.invalid).toHaveLength(0);
});

test('generated queues exclude unsafe candidates, respect capacity, deduplicate and replay identically', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 10 }),
      fc.array(fc.record({ paidOnly: fc.boolean(), available: fc.boolean() }), { maxLength: 40 }),
      (size, flags) => {
        const raw = input(size, flags);
        raw.items.push(...raw.items);
        const result = evaluateQueue(raw, memory);
        expect(result.candidates.length).toBeLessThanOrEqual(size);
        expect(new Set(result.candidates.map((candidate) => candidate.problemId)).size).toBe(
          result.candidates.length,
        );
        expect(
          result.candidates.every(
            (candidate) => !candidate.problem.paidOnly && candidate.problem.available,
          ),
        ).toBe(true);
        expect(evaluateQueue(serializeQueueInput(raw), memory).selectedRanked).toEqual(
          result.selectedRanked,
        );
      },
    ),
    { numRuns: 100 },
  );
});
