import fc from 'fast-check';
import {
  currentEligibility,
  rankCandidates,
  selectQueueCandidates,
} from '../../../apps/api/src/modules/scheduler/eligibility.js';
import { resolvePracticeNeed } from '../../../apps/api/src/modules/scheduler/practice-need.js';
import { defaultConfig } from '../../../apps/api/src/config/default-config.js';
import type {
  MemoryEngine,
  MemoryState,
} from '../../../apps/api/src/modules/memory/memory-engine.interface.js';

const now = new Date('2026-09-12T12:00:00.000Z');
test('removing a lower anchor never grants a practiced skill a new initial exception', () => {
  const attempts = [
    {
      difficulty: 'Easy' as const,
      problemId: 'removed',
      rating: 'GOOD' as const,
      completedAt: now.toISOString(),
      sourceSequence: 1n,
    },
  ];
  expect(currentEligibility(['Hard'], attempts, [], now)).toEqual({
    difficulty: 'Easy',
    admission: { kind: 'BASE_DIFFICULTY' },
  });
  expect(
    currentEligibility(['Hard'], attempts, [], now, 2, [
      {
        difficulty: 'Medium',
        admission: { kind: 'INITIAL_OFFICIAL_ANCHOR', skippedLowerDifficulties: ['Easy'] },
      },
    ])?.difficulty,
  ).toBe('Medium');
});
test('admits the lowest official anchor without claiming lower supply is empty', () => {
  expect(currentEligibility(['Medium', 'Hard'], [], [], now)).toEqual({
    difficulty: 'Medium',
    admission: { kind: 'INITIAL_OFFICIAL_ANCHOR', skippedLowerDifficulties: ['Easy'] },
  });
});

test('requires distinct positive problems after the latest AGAIN', () => {
  const attempts = [
    {
      difficulty: 'Easy' as const,
      problemId: 'a',
      rating: 'GOOD' as const,
      completedAt: now.toISOString(),
      sourceSequence: 1n,
    },
    {
      difficulty: 'Easy' as const,
      problemId: 'a',
      rating: 'EASY' as const,
      completedAt: now.toISOString(),
      sourceSequence: 2n,
    },
  ];
  expect(currentEligibility(['Easy', 'Medium'], attempts, [], now)?.difficulty).toBe('Easy');
  expect(
    currentEligibility(
      ['Easy', 'Medium'],
      [...attempts, { ...attempts[1]!, problemId: 'b', sourceSequence: 3n }],
      [],
      now,
    )?.difficulty,
  ).toBe('Medium');
});

test('uses a fresh complete one-candidate certificate but never partial evidence', () => {
  const attempt = [
    {
      difficulty: 'Easy' as const,
      problemId: 'a',
      rating: 'GOOD' as const,
      completedAt: now.toISOString(),
      sourceSequence: 1n,
    },
  ];
  const proof = {
    certificateId: 'certificate-one',
    difficulty: 'Easy' as const,
    candidateCount: 1,
    fingerprint: 'query-fingerprint',
    catalogRevision: '7',
    observedAt: '2026-09-12T11:00:00.000Z',
    validUntil: '2026-09-13T12:00:00.000Z',
  };
  expect(
    currentEligibility(['Easy', 'Medium'], attempt, [{ ...proof, complete: true }], now)
      ?.difficulty,
  ).toBe('Medium');
  expect(
    currentEligibility(['Easy', 'Medium'], attempt, [{ ...proof, complete: false }], now)
      ?.difficulty,
  ).toBe('Easy');
});

test('certificate expiry does not revoke an issued admission or an attempted tier', () => {
  const attempt = {
    difficulty: 'Easy' as const,
    problemId: 'one',
    rating: 'GOOD' as const,
    completedAt: now.toISOString(),
    sourceSequence: 1n,
  };
  const proof = {
    certificateId: 'proof',
    difficulty: 'Easy' as const,
    complete: true,
    candidateCount: 1,
    fingerprint: 'v1',
    catalogRevision: '1',
    observedAt: now.toISOString(),
    validUntil: new Date(now.getTime() + 1000).toISOString(),
  };
  const admitted = currentEligibility(['Easy', 'Medium'], [attempt], [proof], now)!;
  const after = new Date(now.getTime() + 1001);
  expect(
    currentEligibility(['Easy', 'Medium'], [attempt], [proof], after, 2, [admitted])?.difficulty,
  ).toBe('Medium');
  expect(
    currentEligibility(
      ['Easy', 'Medium'],
      [attempt, { ...attempt, difficulty: 'Medium', sourceSequence: 2n }],
      [],
      after,
    )?.difficulty,
  ).toBe('Medium');
  expect(currentEligibility(['Easy', 'Medium'], [attempt], [proof], after)?.difficulty).toBe(
    'Easy',
  );
});

test('ranking never returns paid, unavailable, active, or cooling candidates', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          paidOnly: fc.boolean(),
          available: fc.boolean(),
          active: fc.boolean(),
          cooling: fc.boolean(),
        }),
      ),
      (values) => {
        const ranked = rankCandidates(
          values.map((value, index) => ({
            problemId: String(index),
            catalogProblemId: String(index),
            skillSlug: 'skill',
            difficulty: 'Easy',
            paidOnly: value.paidOnly,
            available: value.available,
            active: value.active,
            seen: false,
            ...(value.cooling ? { cooldownUntil: '2026-09-13T00:00:00.000Z' } : {}),
            officialPosition: index,
            needReason: 'PROGRESSION',
            needScore: 1,
            tagDiversity: 0,
            repetition: 0,
            provider: 'leetcode',
            providerProblemId: String(index),
          })),
          now,
        );
        return ranked.every(
          (item) => !item.paidOnly && item.available && !item.active && !item.cooldownUntil,
        );
      },
    ),
  );
});

const candidate = (problemId: string, skillSlug: string, officialPosition: number) => ({
  problemId: `${problemId}:${skillSlug}`,
  catalogProblemId: problemId,
  skillSlug,
  difficulty: 'Easy' as const,
  paidOnly: false,
  available: true,
  active: false,
  seen: false,
  officialPosition,
  needReason: 'PROGRESSION' as const,
  needScore: 1,
  tagDiversity: 1,
  repetition: 0,
  provider: 'leetcode',
  providerProblemId: problemId,
});

test('reserves progression capacity across skills and keeps exact problems unique', () => {
  const ranked = [
    candidate('one', 'arrays', 0),
    candidate('two', 'arrays', 1),
    candidate('three', 'strings', 2),
    candidate('one', 'strings', 3),
    candidate('four', 'graphs', 4),
  ];
  const selected = selectQueueCandidates(
    ranked,
    new Map([
      ['arrays', 'PROGRESSION'],
      ['strings', 'PROGRESSION'],
      ['graphs', 'REVIEW'],
    ]),
    5,
    0.4,
  );
  expect(selected.slice(0, 2).map((item) => item.skillSlug)).toEqual(['arrays', 'strings']);
  expect(new Set(selected.map((item) => item.catalogProblemId)).size).toBe(selected.length);
});

test('alternates a one-slot queue using persisted prior completion context', () => {
  const ranked = [candidate('progress', 'arrays', 0), candidate('review', 'graphs', 1)];
  const reasons = new Map([
    ['arrays', 'PROGRESSION' as const],
    ['graphs', 'REVIEW' as const],
  ]);
  expect(selectQueueCandidates(ranked, reasons, 1, 0.4, true)[0]?.catalogProblemId).toBe(
    'progress',
  );
  expect(selectQueueCandidates(ranked, reasons, 1, 0.4, false)[0]?.catalogProblemId).toBe('review');
});

test('ranks an unfinished progression anchor before an earlier completed anchor', () => {
  const completed = { ...candidate('completed', 'arrays', 0), seen: true };
  const unfinished = candidate('unfinished', 'arrays', 15);
  expect(rankCandidates([completed, unfinished], now)[0]?.catalogProblemId).toBe('unfinished');
});

test('records exact scarcity and skipped-tier certificates in admission evidence', () => {
  const facts = [
    {
      certificateId: 'one-easy',
      difficulty: 'Easy' as const,
      complete: true,
      candidateCount: 1,
      fingerprint: 'easy-query',
      catalogRevision: '3',
      observedAt: '2026-09-12T10:00:00.000Z',
      validUntil: '2026-09-13T12:00:00.000Z',
    },
    {
      certificateId: 'zero-medium',
      difficulty: 'Medium' as const,
      complete: true,
      candidateCount: 0,
      fingerprint: 'medium-query',
      catalogRevision: '3',
      observedAt: '2026-09-12T10:01:00.000Z',
      validUntil: '2026-09-13T12:00:00.000Z',
    },
  ];
  const result = currentEligibility(
    ['Easy', 'Hard'],
    [
      {
        difficulty: 'Easy',
        problemId: 'only-easy',
        rating: 'GOOD',
        completedAt: now.toISOString(),
        sourceSequence: 1n,
      },
    ],
    facts,
    now,
  );
  expect(result).toMatchObject({
    difficulty: 'Hard',
    admission: {
      kind: 'EVIDENCE',
      supplyException: true,
      skippedEmptyDifficulties: ['Medium'],
      supplyEvidence: [
        { certificateId: 'one-easy', candidateCount: 1 },
        { certificateId: 'zero-medium', candidateCount: 0 },
      ],
    },
  });
});

const memoryState = (difficulty: string, retention: number): MemoryState => ({
  adapterVersion: defaultConfig.memory.adapterVersion,
  due: now.toISOString(),
  stability: retention,
  difficulty: difficulty === 'Hard' ? 8 : 3,
  elapsedDays: 0,
  scheduledDays: 1,
  learningSteps: 0,
  reps: 2,
  lapses: 0,
  state: 2,
  lastReview: '2026-08-01T12:00:00.000Z',
  configVersion: defaultConfig.version,
});
const memory: MemoryEngine = {
  review: (state) => state!,
  retention: (state) => state.stability,
  firstBelow: (state, threshold, from, through) =>
    state.stability < threshold && from <= through ? new Date('2026-09-01T12:00:00.000Z') : null,
};
const configurations = [{ activatedAt: '2026-01-01T00:00:00.000Z', config: defaultConfig }];

test.each([0.49, 0.9])('unattempted promotion checks lower retention %s', (retention) => {
  const result = resolvePracticeNeed({
    officialDifficulties: ['Easy', 'Medium'],
    attempts: ['a', 'b'].map((problemId, index) => ({
      problemId,
      difficulty: 'Easy' as const,
      rating: 'GOOD' as const,
      completedAt: '2026-08-01T12:00:00.000Z',
      sourceSequence: BigInt(index + 1),
    })),
    supply: [],
    memories: [{ difficulty: 'Easy', state: memoryState('Easy', retention) }],
    configurations,
    evaluationTime: now,
    memory,
  });
  expect(result).toMatchObject(
    retention < 0.5
      ? { difficulty: 'Easy', reason: 'REVALIDATION' }
      : { difficulty: 'Medium', reason: 'PROGRESSION' },
  );
});

test('regression is derived from persisted time and asks for a lower review', () => {
  const result = resolvePracticeNeed({
    officialDifficulties: ['Easy', 'Medium'],
    attempts: [
      {
        difficulty: 'Easy',
        problemId: 'a',
        rating: 'GOOD',
        completedAt: now.toISOString(),
        sourceSequence: 1n,
      },
      {
        difficulty: 'Easy',
        problemId: 'b',
        rating: 'GOOD',
        completedAt: now.toISOString(),
        sourceSequence: 2n,
      },
    ],
    supply: [],
    memories: [{ difficulty: 'Medium', state: memoryState('Medium', 0.49) }],
    configurations,
    evaluationTime: now,
    memory,
  });
  expect(result).toMatchObject({ difficulty: 'Easy', reason: 'REVALIDATION' });
  expect(result?.regressionBoundary).toBe('2026-09-01T12:00:00.000Z');
});

test('one fresh healthy lower review reopens advanced revalidation without transferring memory', () => {
  const result = resolvePracticeNeed({
    officialDifficulties: ['Easy', 'Medium'],
    attempts: [
      {
        difficulty: 'Easy',
        problemId: 'a',
        rating: 'GOOD',
        completedAt: '2026-08-01T00:00:00.000Z',
        sourceSequence: 1n,
      },
      {
        difficulty: 'Easy',
        problemId: 'b',
        rating: 'GOOD',
        completedAt: '2026-08-02T00:00:00.000Z',
        sourceSequence: 2n,
      },
      {
        difficulty: 'Easy',
        problemId: 'c',
        rating: 'GOOD',
        completedAt: '2026-09-02T00:00:00.000Z',
        sourceSequence: 3n,
      },
    ],
    supply: [],
    memories: [
      { difficulty: 'Easy', state: memoryState('Easy', 0.9) },
      { difficulty: 'Medium', state: memoryState('Medium', 0.49) },
    ],
    configurations,
    evaluationTime: now,
    memory,
  });
  expect(result).toMatchObject({ difficulty: 'Medium', reason: 'REVALIDATION' });
});

test('unknown lower supply does not authorize same-difficulty revalidation', () => {
  expect(
    resolvePracticeNeed({
      officialDifficulties: ['Medium'],
      attempts: [
        {
          difficulty: 'Medium',
          problemId: 'm',
          rating: 'GOOD',
          completedAt: now.toISOString(),
          sourceSequence: 1n,
        },
      ],
      supply: [],
      memories: [{ difficulty: 'Medium', state: memoryState('Medium', 0.49) }],
      configurations,
      evaluationTime: now,
      memory,
    }),
  ).toBeNull();
});
