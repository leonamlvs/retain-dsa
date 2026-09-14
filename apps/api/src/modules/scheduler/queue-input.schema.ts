import { z } from 'zod';
import { studyConfigSchema } from '../../config/study-config.schema.js';
import { difficultySchema } from '../../domain/catalog.schema.js';
import { feedbackSchema } from '../feedback/feedback.schema.js';

const problem = z.object({
  id: z.string(),
  provider: z.string(),
  providerProblemId: z.string(),
  frontendId: z.string(),
  title: z.string(),
  slug: z.string(),
  url: z.string(),
  difficulty: difficultySchema,
  paidOnly: z.boolean(),
  available: z.boolean(),
  tags: z.array(z.object({ tag: z.string() })),
});
const skill = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  tags: z.array(z.string()),
  mappingVersion: z.string(),
  active: z.boolean(),
});
// Keep bounded pedagogical inputs; prior decisions are referenced by the issuance records,
// never recursively embedded in each subsequent queue decision.
const admission = z.object({ eligibility: z.unknown().optional(), reason: z.string().optional() });
export const queueInputSchema = z.object({
  version: z.literal('queue-input-v1'),
  evaluatedAt: z.coerce.date(),
  config: studyConfigSchema,
  configurations: z.array(z.object({ activatedAt: z.string(), config: studyConfigSchema })),
  items: z.array(
    z.object({
      id: z.string(),
      problemId: z.string(),
      skillId: z.string(),
      position: z.number().nullable(),
      problem,
      skill,
    }),
  ),
  problems: z.array(problem),
  attempts: z.array(
    z.object({
      problemId: z.string(),
      skillId: z.string(),
      difficulty: difficultySchema,
      completedAt: z.coerce.date(),
      sourceSequence: z.coerce.bigint(),
      configVersion: z.string(),
      feedback: feedbackSchema,
      historicalSnapshot: z.object({ tags: z.array(z.string()) }).passthrough(),
      recommendation: z.object({ admissionBasis: admission }),
    }),
  ),
  issuances: z.array(
    z.object({
      id: z.string(),
      problemId: z.string(),
      skillId: z.string(),
      difficulty: difficultySchema,
      status: z.string(),
      position: z.number(),
      issuedAt: z.coerce.date(),
      admissionBasis: admission,
    }),
  ),
  certificates: z.array(
    z.object({
      id: z.string(),
      skillId: z.string(),
      difficulty: difficultySchema,
      fingerprint: z.string(),
      catalogRevision: z.coerce.bigint(),
      observedAt: z.coerce.date(),
      validUntil: z.coerce.date(),
      providerIds: z.array(z.string()),
    }),
  ),
});
export type QueueInput = z.infer<typeof queueInputSchema>;
