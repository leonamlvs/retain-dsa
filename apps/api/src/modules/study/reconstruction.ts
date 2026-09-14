import { z } from 'zod';
import { studyConfigSchema } from '../../config/study-config.schema.js';
import { canonical } from '../../domain/canonical.js';
import { DomainError } from '../../domain/domain-error.js';
import { feedbackSchema } from '../feedback/feedback.schema.js';
import { scoreFeedback } from '../feedback/feedback-scorer.js';
import { cooldownUntil } from '../memory/cooldown.js';
import type { MemoryEngine, MemoryState } from '../memory/memory-engine.interface.js';

export const reconstructionRequestSchema = z.object({
  userId: z.string().uuid(),
  evaluationTime: z.coerce.date(),
  cutoffSequence: z.coerce.bigint().nonnegative(),
});
export type ReconstructionRequest = z.infer<typeof reconstructionRequestSchema>;

const reconstructionSourcesSchema = z.object({
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
});

export function reconstructLearningState(raw: unknown, memory: MemoryEngine) {
  const { attempts, configurations } = reconstructionSourcesSchema.parse(raw);
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
      independence: attempt.feedback.independence,
      recognition: attempt.feedback.recognition,
      implementation: attempt.feedback.implementation,
      complexity: attempt.feedback.complexity,
    });
    const evidence = scoreFeedback(answers, config);
    if (
      attempt.feedback.scoreUnits !== evidence.scoreUnits ||
      attempt.feedback.appliedCap !== evidence.cap ||
      attempt.feedback.rating !== evidence.rating ||
      attempt.feedback.scorerVersion !== evidence.scorerVersion
    )
      throw new DomainError(
        'RECONSTRUCTION_MISMATCH',
        `Attempt ${attempt.id} scoring audit failed.`,
      );

    const memoryKey = `${attempt.skillId}:${attempt.difficulty}`;
    const nextMemory = memory.review(
      memoryStates.get(memoryKey),
      evidence.rating,
      attempt.completedAt,
      config,
    );
    if (canonical(nextMemory) !== canonical(attempt.feedback.memoryTransition))
      throw new DomainError(
        'RECONSTRUCTION_MISMATCH',
        `Attempt ${attempt.id} memory audit failed.`,
      );
    memoryStates.set(memoryKey, nextMemory);

    const previous = problemStates.get(attempt.problemId);
    problemStates.set(attempt.problemId, {
      firstCompletedAt: previous?.firstCompletedAt ?? attempt.completedAt,
      lastCompletedAt: attempt.completedAt,
      completionCount: (previous?.completionCount ?? 0) + 1,
      cooldownUntil: new Date(cooldownUntil(nextMemory, attempt.completedAt, config)),
    });
  }

  return { memoryStates, problemStates };
}
