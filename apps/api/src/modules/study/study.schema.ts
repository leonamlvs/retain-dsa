import { z } from 'zod';
import { difficultySchema } from '../../domain/catalog.schema.js';
import { feedbackSchema } from '../feedback/feedback.schema.js';
import { assertLocalDate, dateRange, localDateAt } from '../../domain/calendar.js';

export const generationSchema = z.string().uuid();

export const sessionResponseSchema = z.object({
  generation: generationSchema,
});

export const recommendationSchema = z.object({
  id: z.string().uuid(),
  provider: z.literal('leetcode'),
  providerProblemId: z.string(),
  frontendId: z.string(),
  title: z.string(),
  slug: z.string(),
  url: z.string().url(),
  difficulty: difficultySchema,
  primarySkill: z.object({ slug: z.string(), name: z.string() }),
  tags: z.array(z.string()),
  reason: z.enum(['REVIEW', 'PROGRESSION', 'REVALIDATION']),
  issuedAt: z.string().datetime(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'REPLACED', 'INVALIDATED']),
  recordable: z.boolean(),
});

export const recommendationDetailSchema = recommendationSchema.extend({
  generation: generationSchema,
});

export const recommendationsResponseSchema = z.object({
  generation: generationSchema,
  items: z.array(recommendationSchema),
  refill: z.object({
    status: z.enum(['READY', 'REFILLING', 'SHORTAGE']),
    reason: z.string().nullable(),
  }),
});

export const curriculumResponseSchema = z.object({
  generation: generationSchema,
  name: z.string(),
  progressPercentage: z.number().min(0).max(100).nullable(),
  completedAnchors: z.number().int().nonnegative(),
  totalAnchors: z.number().int().nonnegative(),
});

const countSchema = z.object({ key: z.string(), count: z.number().int().nonnegative() });
const localDateSchema = z.string().refine(
  (value) => {
    try {
      assertLocalDate(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Expected a valid YYYY-MM-DD date.' },
);
export const analyticsQuerySchema = z
  .object({
    timezone: z
      .string()
      .min(1)
      .max(100)
      .refine(
        (value) => {
          try {
            localDateAt(new Date(0), value);
            return true;
          } catch {
            return false;
          }
        },
        { message: 'Expected an IANA timezone.' },
      ),
    from: localDateSchema.optional(),
    to: localDateSchema.optional(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.from) !== Boolean(value.to))
      context.addIssue({ code: 'custom', message: 'from and to must be supplied together.' });
    if (value.from && value.to) {
      try {
        dateRange(value.from, value.to, 3660);
      } catch {
        context.addIssue({ code: 'custom', message: 'Date range must contain 1 to 3660 days.' });
      }
    }
  });
export const analyticsResponseSchema = z.object({
  generation: generationSchema,
  uniqueProblems: z.number().int().nonnegative(),
  totalAttempts: z.number().int().nonnegative(),
  currentStreak: z.number().int().nonnegative(),
  longestStreak: z.number().int().nonnegative(),
  medianDurationSeconds: z.number().nonnegative().nullable(),
  heatmap: z.array(z.object({ date: z.string().date(), count: z.number().int().positive() })),
  bySkill: z.array(countSchema),
  byDifficulty: z.array(countSchema),
  feedback: z.object({
    independence: z.array(countSchema),
    recognition: z.array(countSchema),
    implementation: z.array(countSchema),
    complexity: z.array(countSchema),
  }),
  evolution: z.array(
    z.object({
      date: z.string().date(),
      attempts: z.number().int().positive(),
      cumulative: z.number().int().positive(),
    }),
  ),
});
export const heatmapResponseSchema = analyticsResponseSchema.pick({
  generation: true,
  heatmap: true,
});
export const skillsResponseSchema = analyticsResponseSchema.pick({
  generation: true,
  bySkill: true,
  byDifficulty: true,
});
export const evolutionResponseSchema = analyticsResponseSchema.pick({
  generation: true,
  evolution: true,
});

export const createAttemptSchema = z
  .object({
    recommendationId: z.string().uuid(),
    generation: generationSchema,
    feedbackSchemaVersion: z.literal('feedback-v1'),
    answers: feedbackSchema,
    durationSeconds: z.number().int().nonnegative().nullable().optional(),
    timezone: z.string().min(1).max(100),
  })
  .strict();

export const attemptResponseSchema = z.object({
  generation: generationSchema,
  attempt: z.object({
    id: z.string().uuid(),
    recommendationId: z.string().uuid(),
    completedAt: z.string().datetime(),
    completedLocalDate: z.string().date(),
    durationSeconds: z.number().int().nonnegative().nullable(),
    score: z.number().min(0).max(1),
    rating: z.enum(['AGAIN', 'HARD', 'GOOD', 'EASY']),
  }),
});

export const resetProgressSchema = z
  .object({ confirmation: z.literal('RESET'), generation: generationSchema })
  .strict();

export const resetProgressResponseSchema = z.object({ generation: generationSchema });

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.unknown()).optional(),
  }),
});

export type CreateAttempt = z.infer<typeof createAttemptSchema>;
export type RecommendationResponse = z.infer<typeof recommendationSchema>;
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
