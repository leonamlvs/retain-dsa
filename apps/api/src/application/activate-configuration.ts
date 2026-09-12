import { studyConfigSchema } from '../config/study-config.schema.js';
import type { Clock } from '../domain/clock.interface.js';
import type { ConfigurationRepository } from './configuration-repository.interface.js';

export async function activateConfiguration(
  raw: unknown,
  repository: ConfigurationRepository,
  clock: Clock,
): Promise<void> {
  const config = studyConfigSchema.parse(raw);
  await repository.activate(config, clock);
}
