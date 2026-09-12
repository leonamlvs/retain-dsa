import { z } from 'zod';
import { studyConfigSchema } from '../../config/study-config.schema.js';
import { DomainError } from '../../domain/domain-error.js';
import { canonical, hash } from '../../domain/canonical.js';
import { feedbackSchema } from '../feedback/feedback.schema.js';
import { scoreFeedback } from '../feedback/feedback-scorer.js';
import { cooldownUntil } from '../memory/cooldown.js';
import type { MemoryEngine, MemoryState } from '../memory/memory-engine.interface.js';
import { evaluateQueue } from '../scheduler/queue-engine.js';
import { rankCandidates, selectQueueCandidates } from '../scheduler/eligibility.js';

export const replayRequestSchema = z.object({
  userId: z.string().uuid(),
  evaluationTime: z.coerce.date(),
  cutoffSequence: z.coerce.bigint().nonnegative(),
});
export type ReplayRequest = z.infer<typeof replayRequestSchema>;
export const replaySourcesSchema = z.object({
  attempts: z.array(
    z.object({
      id: z.string(),
      problemId: z.string(),
      skillId: z.string(),
      difficulty: z.string(),
      configVersion: z.string(),
      completedAt: z.coerce.date(),
      sourceSequence: z.coerce.bigint(),
      feedback: feedbackSchema
        .extend({
          scoreUnits: z.number(),
          appliedCap: z.string(),
          rating: z.string(),
          scorerVersion: z.string(),
          memoryTransition: z.unknown(),
        })
        .strip(),
    }),
  ),
  configurations: z.array(z.object({ version: z.string(), parameters: studyConfigSchema })),
  decisions: z.array(
    z.object({
      id: z.string(),
      configVersion: z.string(),
      evaluatedAt: z.coerce.date(),
      sourceSequence: z.coerce.bigint(),
      inputs: z.unknown(),
      auditOutputs: z.unknown(),
    }),
  ),
  issuances: z.array(z.object({ id: z.string(), decisionId: z.string() })),
  events: z.array(
    z.object({
      recommendationId: z.string(),
      kind: z.string(),
      sourceSequence: z.coerce.bigint(),
      at: z.coerce.date(),
      details: z.unknown(),
    }),
  ),
});
export function replayStudySources(raw: unknown, memory: MemoryEngine) {
  const { attempts, configurations, decisions, issuances, events } = replaySourcesSchema.parse(raw);
  attempts.sort((a, b) =>
    a.sourceSequence < b.sourceSequence ? -1 : a.sourceSequence > b.sourceSequence ? 1 : 0,
  );
  const configs = new Map(
    configurations.map((row) => [row.version, studyConfigSchema.parse(row.parameters)]),
  );
  const memoryStates = new Map<string, MemoryState>();
  const problemStates = new Map<
    string,
    {
      firstCompletedAt: Date;
      lastCompletedAt: Date;
      completionCount: number;
      cooldownUntil: Date;
    }
  >();
  for (const attempt of attempts) {
    const config = configs.get(attempt.configVersion);
    if (!config)
      throw new DomainError(
        'MISSING_CONFIG_VERSION',
        `Attempt ${attempt.id} references unavailable configuration ${attempt.configVersion}.`,
      );
    const answers = feedbackSchema.parse({
      independence: attempt.feedback?.independence,
      recognition: attempt.feedback?.recognition,
      implementation: attempt.feedback?.implementation,
      complexity: attempt.feedback?.complexity,
    });
    const evidence = scoreFeedback(answers, config);
    if (
      !attempt.feedback ||
      attempt.feedback.scoreUnits !== evidence.scoreUnits ||
      attempt.feedback.appliedCap !== evidence.cap ||
      attempt.feedback.rating !== evidence.rating ||
      attempt.feedback.scorerVersion !== evidence.scorerVersion
    )
      throw new DomainError('REPLAY_MISMATCH', `Attempt ${attempt.id} scoring audit failed.`);
    const memoryKey = `${attempt.skillId}:${attempt.difficulty}`;
    const nextMemory = memory.review(
      memoryStates.get(memoryKey),
      evidence.rating,
      attempt.completedAt,
      config,
    );
    if (canonical(nextMemory) !== canonical(attempt.feedback.memoryTransition))
      throw new DomainError('REPLAY_MISMATCH', `Attempt ${attempt.id} memory audit failed.`);
    memoryStates.set(memoryKey, nextMemory);
    const previous = problemStates.get(attempt.problemId);
    problemStates.set(attempt.problemId, {
      firstCompletedAt: previous?.firstCompletedAt ?? attempt.completedAt,
      lastCompletedAt: attempt.completedAt,
      completionCount: (previous?.completionCount ?? 0) + 1,
      cooldownUntil: new Date(cooldownUntil(nextMemory, attempt.completedAt, config)),
    });
  }
  for (const decision of decisions) {
    const config = configs.get(decision.configVersion);
    if (!config)
      throw new DomainError(
        'MISSING_CONFIG_VERSION',
        `Decision ${decision.id} references unavailable configuration ${decision.configVersion}.`,
      );
    const inputs = decision.inputs as Record<string, unknown>;
    const ranking = inputs.ranking as
      | {
          candidates?: unknown[];
          algorithmVersion?:
            'candidate-ranking-v1' | 'candidate-ranking-v2' | 'queue-engine-v3' | 'queue-engine-v4';
          rawInput?: unknown;
          rawInputHash?: string;
          candidateCount?: number;
          completePoolHash?: string;
          selectionIndex?: number;
          selection?: {
            count?: number;
            progressionFraction?: number;
            preferProgression?: boolean;
            reasonBySkill?: Record<string, 'PROGRESSION' | 'REVIEW' | 'REVALIDATION'>;
          };
        }
      | undefined;
    if (!ranking)
      throw new DomainError(
        'REPLAY_INPUT_MISSING',
        `Decision ${decision.id} predates the required ranking inputs.`,
      );
    if (
      !Array.isArray(ranking.candidates) ||
      !Number.isInteger(ranking.selectionIndex) ||
      !ranking.selection ||
      !Number.isInteger(ranking.selection.count) ||
      typeof ranking.selection.progressionFraction !== 'number' ||
      typeof ranking.selection.preferProgression !== 'boolean' ||
      !ranking.selection.reasonBySkill
    )
      throw new DomainError('REPLAY_MISMATCH', `Decision ${decision.id} has invalid inputs.`);
    if (ranking.completePoolHash !== hash(ranking.candidates))
      throw new DomainError('REPLAY_MISMATCH', `Decision ${decision.id} pool audit failed.`);
    if (
      ranking.algorithmVersion === 'queue-engine-v3' ||
      ranking.algorithmVersion === 'queue-engine-v4'
    ) {
      if (!ranking.rawInput || hash(ranking.rawInput) !== ranking.rawInputHash)
        throw new DomainError('REPLAY_MISMATCH', 'Raw queue input audit failed.');
      const replay = evaluateQueue(ranking.rawInput, memory, ranking.algorithmVersion);
      const expected = replay.selectedRanked[ranking.selectionIndex!];
      const output = decision.auditOutputs as Record<string, unknown>;
      if (
        !expected ||
        expected.problemId !== output.selectedProblemKey ||
        hash(replay.rankingInput) !== ranking.completePoolHash
      )
        throw new DomainError('REPLAY_MISMATCH', 'Source-based queue derivation failed.');
      continue;
    }
    const ranked = rankCandidates(
      ranking.candidates as unknown as Parameters<typeof rankCandidates>[0],
      decision.evaluatedAt,
      config.scheduler.candidateWeights,
      ranking.algorithmVersion ?? 'candidate-ranking-v1',
    );
    if (ranking.candidateCount !== ranked.length)
      throw new DomainError('REPLAY_MISMATCH', `Decision ${decision.id} pool count failed.`);
    const selected = selectQueueCandidates(
      ranked,
      new Map(Object.entries(ranking.selection.reasonBySkill)),
      ranking.selection.count!,
      ranking.selection.progressionFraction!,
      ranking.selection.preferProgression!,
    );
    const expected = selected[ranking.selectionIndex!];
    const output = decision.auditOutputs as Record<string, unknown>;
    if (!expected || expected.problemId !== output.selectedProblemKey)
      throw new DomainError('REPLAY_MISMATCH', `Decision ${decision.id} ranking audit failed.`);
  }

  const recommendations = issuances.map((issuance) => {
    const decision = decisions.find((item) => item.id === issuance.decisionId);
    if (!decision)
      throw new DomainError('REPLAY_INPUT_MISSING', 'Issuance decision is unavailable.');
    const ranking = (
      decision.inputs as {
        ranking: { rawInput?: unknown; algorithmVersion?: string; selectionIndex: number };
      }
    ).ranking;
    if (
      !ranking.rawInput ||
      !['queue-engine-v3', 'queue-engine-v4'].includes(ranking.algorithmVersion ?? '')
    )
      throw new DomainError(
        'REPLAY_INPUT_MISSING',
        'Lifecycle reconstruction requires versioned raw queue inputs.',
      );
    const queue = evaluateQueue(
      ranking.rawInput,
      memory,
      ranking.algorithmVersion as 'queue-engine-v3' | 'queue-engine-v4',
    );
    let position = queue.surviving.length + ranking.selectionIndex;
    let status = 'ACTIVE';
    let issued = false;
    for (const event of events
      .filter((item) => item.recommendationId === issuance.id)
      .sort((a, b) => (a.sourceSequence < b.sourceSequence ? -1 : 1))) {
      if (event.kind === 'ISSUED') issued = true;
      else if (['COMPLETED', 'INVALIDATED', 'REPLACED'].includes(event.kind)) status = event.kind;
      else if (event.kind === 'REORDERED') {
        const to = (event.details as { to?: number }).to;
        if (!Number.isInteger(to) || to! < 0)
          throw new DomainError('REPLAY_MISMATCH', 'Invalid lifecycle position.');
        position = to!;
      } else
        throw new DomainError('REPLAY_INPUT_MISSING', `Unsupported lifecycle event ${event.kind}.`);
    }
    if (!issued)
      throw new DomainError('REPLAY_INPUT_MISSING', 'Issuance lifecycle event is missing.');
    return { id: issuance.id, status, position };
  });
  return { memoryStates, problemStates, recommendations };
}
