import type { z } from 'zod';
import type {
  analyticsResponseSchema,
  analyticsQuerySchema,
  attemptResponseSchema,
  createAttemptSchema,
  curriculumResponseSchema,
  recommendationDetailSchema,
  recommendationsResponseSchema,
  resetProgressResponseSchema,
  sessionResponseSchema,
} from './study.schema.js';

export interface AttemptResult {
  status: 200 | 201;
  body: z.infer<typeof attemptResponseSchema>;
}

export interface StudyService {
  session(): Promise<z.infer<typeof sessionResponseSchema>>;
  health(): Promise<'up' | 'down'>;
  curriculum(): Promise<z.infer<typeof curriculumResponseSchema>>;
  recommendations(): Promise<z.infer<typeof recommendationsResponseSchema>>;
  recommendation(id: string): Promise<z.infer<typeof recommendationDetailSchema> | null>;
  complete(
    input: z.infer<typeof createAttemptSchema>,
    idempotencyKey: string,
  ): Promise<AttemptResult>;
  analytics(
    query: z.infer<typeof analyticsQuerySchema>,
  ): Promise<z.infer<typeof analyticsResponseSchema>>;
  reset(generation: string): Promise<z.infer<typeof resetProgressResponseSchema>>;
}
