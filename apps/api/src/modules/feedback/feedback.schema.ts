import { z } from 'zod';
export const feedbackSchema = z
  .object({
    independence: z.enum([
      'FAILED',
      'FULL_SOLUTION',
      'SUBSTANTIAL_HELP',
      'ONE_HINT',
      'INDEPENDENT',
    ]),
    recognition: z.enum(['NOT_RECOGNIZED', 'AFTER_HELP', 'INDEPENDENT']),
    implementation: z.enum(['UNABLE', 'MAJOR_DIFFICULTY', 'MINOR_DIFFICULTY', 'SMOOTH']),
    complexity: z.enum(['UNABLE', 'PARTIAL', 'CORRECT']),
  })
  .strict();
export type Feedback = z.infer<typeof feedbackSchema>;
