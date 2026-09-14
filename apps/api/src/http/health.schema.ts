import { z } from 'zod';
export const healthSchema = z
  .object({
    status: z.enum(['healthy', 'degraded', 'unhealthy']),
    database: z.enum(['up', 'down', 'unconfigured']),
    provider: z.enum(['available', 'degraded', 'unknown']),
  })
  .strict();
