import { z } from 'zod';
const fixed = z.number().int().min(0).max(10_000);
const answerValues = z
  .object({
    independence: z
      .object({
        FAILED: fixed,
        FULL_SOLUTION: fixed,
        SUBSTANTIAL_HELP: fixed,
        ONE_HINT: fixed,
        INDEPENDENT: fixed,
      })
      .strict(),
    recognition: z
      .object({ NOT_RECOGNIZED: fixed, AFTER_HELP: fixed, INDEPENDENT: fixed })
      .strict(),
    implementation: z
      .object({ UNABLE: fixed, MAJOR_DIFFICULTY: fixed, MINOR_DIFFICULTY: fixed, SMOOTH: fixed })
      .strict(),
    complexity: z.object({ UNABLE: fixed, PARTIAL: fixed, CORRECT: fixed }).strict(),
  })
  .strict();
export const studyConfigSchema = z
  .object({
    version: z.string().min(1),
    feedbackSchemaVersion: z.literal('feedback-v1'),
    scorerVersion: z.literal('fixed-point-v1'),
    memory: z
      .object({
        adapterVersion: z.literal('ts-fsrs-5.4.2-v1'),
        requestRetention: z.number().gt(0).lt(1),
        maximumIntervalDays: z.number().int().positive(),
        parameters: z.array(z.number().finite()).length(21),
        enableFuzz: z.literal(false),
        enableShortTerm: z.literal(false),
        learningSteps: z.array(z.string().regex(/^\d+[mhd]$/)),
        relearningSteps: z.array(z.string().regex(/^\d+[mhd]$/)),
      })
      .strict(),
    feedback: z
      .object({
        weights: z
          .object({
            independence: fixed,
            recognition: fixed,
            implementation: fixed,
            complexity: fixed,
          })
          .strict(),
        values: answerValues,
        boundaries: z.tuple([fixed, fixed, fixed]),
        caps: z
          .object({
            FAILED: z.literal('AGAIN'),
            FULL_SOLUTION: z.literal('AGAIN'),
            UNABLE: z.literal('AGAIN'),
            SUBSTANTIAL_HELP: z.literal('HARD'),
            ONE_HINT: z.literal('GOOD'),
          })
          .strict(),
      })
      .strict(),
    scheduler: z
      .object({
        queueSize: z.number().int().min(1).max(100),
        reviewThreshold: z.number().gt(0).lt(1),
        regressionThreshold: z.number().gt(0).lt(1),
        positiveEvidenceRequired: z.number().int().min(2),
        progressionFraction: z.number().gt(0).lte(1),
        cooldownMultiplier: z.number().positive(),
        minimumCooldownDays: z.number().positive(),
        maximumCooldownDays: z.number().positive(),
        recentLookback: z.number().int().positive(),
        needWeights: z
          .object({
            retention: z.number().nonnegative(),
            unseen: z.number().nonnegative(),
            anchor: z.number().nonnegative(),
            activePenalty: z.number().nonnegative(),
          })
          .strict(),
        candidateWeights: z
          .object({
            unseen: z.number().nonnegative(),
            diversity: z.number().nonnegative(),
            repetitionPenalty: z.number().nonnegative(),
          })
          .strict(),
      })
      .strict(),
    discovery: z
      .object({
        queryVersion: z.literal('leetcode-v2-2026-09'),
        mappingVersion: z.literal('leetcode75-tags-v1'),
        minimumPool: z.number().int().positive(),
        targetPool: z.number().int().positive(),
        pageSize: z.number().int().min(1).max(100),
        maximumPages: z.number().int().positive(),
        requestTimeoutMs: z.number().int().positive(),
        perNeedBudgetMs: z.number().int().positive(),
        totalBudgetMs: z.number().int().positive(),
        retries: z.number().int().min(0).max(3),
        retryDelayMs: z.number().int().positive(),
        certificateTtlMs: z.number().int().positive(),
        metadataTtlMs: z.number().int().positive(),
        workerRetryMs: z.number().int().positive(),
      })
      .strict(),
  })
  .strict()
  .superRefine((config, context) => {
    const issue = (message: string) => context.addIssue({ code: 'custom', message });
    if (Object.values(config.feedback.weights).reduce((a, b) => a + b, 0) !== 10_000)
      issue('Feedback weights must sum to 10000.');
    const [again, hard, good] = config.feedback.boundaries;
    if (!(0 < again && again < hard && hard < good && good < 10_000))
      issue('Rating boundaries must be strictly ordered.');
    if (config.scheduler.regressionThreshold >= config.scheduler.reviewThreshold)
      issue('Regression must be below review threshold.');
    if (config.scheduler.minimumCooldownDays > config.scheduler.maximumCooldownDays)
      issue('Cooldown limits are inverted.');
    if (config.discovery.minimumPool > config.discovery.targetPool)
      issue('Candidate minimum exceeds target.');
    if (
      config.discovery.requestTimeoutMs > config.discovery.perNeedBudgetMs ||
      config.discovery.perNeedBudgetMs > config.discovery.totalBudgetMs
    )
      issue('Discovery budgets must be nested.');
  });
export type StudyConfig = z.infer<typeof studyConfigSchema>;
