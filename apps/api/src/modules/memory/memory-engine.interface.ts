import type { StudyConfig } from '../../config/study-config.schema.js';
import type { MemoryRating } from '../feedback/feedback-scorer.js';
export interface MemoryState {
  adapterVersion: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: string;
  configVersion: string;
}
export interface MemoryEngine {
  review(
    previous: MemoryState | undefined,
    rating: MemoryRating,
    at: Date,
    config: StudyConfig,
  ): MemoryState;
  retention(state: MemoryState, at: Date, config: StudyConfig): number;
  firstBelow(
    state: MemoryState,
    threshold: number,
    from: Date,
    through: Date,
    config: StudyConfig,
  ): Date | null;
}
