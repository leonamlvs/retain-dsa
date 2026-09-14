import type { StudyConfig } from '../config/study-config.schema.js';
import type { Clock } from '../domain/clock.interface.js';

export interface ConfigurationRepository {
  activate(config: StudyConfig, clock: Clock): Promise<void>;
}
