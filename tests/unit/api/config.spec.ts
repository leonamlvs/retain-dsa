import { defaultConfig } from '../../../apps/api/src/config/default-config.js';
import { studyConfigSchema } from '../../../apps/api/src/config/study-config.schema.js';
test('rejects inconsistent tuning before startup', () => {
  const config = structuredClone(defaultConfig);
  config.feedback.weights.complexity++;
  config.scheduler.regressionThreshold = 0.9;
  config.discovery.minimumPool = 50;
  config.discovery.requestTimeoutMs = 40000;
  const parsed = studyConfigSchema.safeParse(config);
  expect(parsed.success).toBe(false);
  if (!parsed.success) expect(parsed.error.issues.length).toBeGreaterThanOrEqual(4);
});
