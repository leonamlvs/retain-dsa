import { createEmptyCard, fsrs, Rating, type Card, type StepUnit } from 'ts-fsrs';
import type { StudyConfig } from '../config/study-config.schema.js';
import { DomainError } from '../domain/domain-error.js';
import type { MemoryState, MemoryEngine } from '../modules/memory/memory-engine.interface.js';
import type { MemoryRating } from '../modules/feedback/feedback-scorer.js';
import { assertInstant } from '../domain/calendar.js';
const adapterVersion = 'ts-fsrs-5.4.2-v1';
const ratingMap = {
  AGAIN: Rating.Again,
  HARD: Rating.Hard,
  GOOD: Rating.Good,
  EASY: Rating.Easy,
} as const;
function scheduler(config: StudyConfig) {
  if (config.memory.adapterVersion !== adapterVersion)
    throw new DomainError('MISSING_ADAPTER_VERSION', 'Historical adapter is unavailable.');
  return fsrs({
    request_retention: config.memory.requestRetention,
    maximum_interval: config.memory.maximumIntervalDays,
    w: [...config.memory.parameters],
    enable_fuzz: false,
    enable_short_term: false,
    learning_steps: config.memory.learningSteps as StepUnit[],
    relearning_steps: config.memory.relearningSteps as StepUnit[],
  });
}
function card(state: MemoryState): Card {
  if (state.adapterVersion !== adapterVersion)
    throw new DomainError('MISSING_ADAPTER_VERSION', 'Historical adapter is unavailable.');
  return {
    due: assertInstant(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsedDays,
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningSteps,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state,
    last_review: assertInstant(state.lastReview),
  };
}
export class FsrsMemoryEngine implements MemoryEngine {
  review(
    previous: MemoryState | undefined,
    rating: MemoryRating,
    at: Date,
    config: StudyConfig,
  ): MemoryState {
    assertInstant(at);
    if (previous && at.getTime() < Date.parse(previous.lastReview))
      throw new DomainError('CLOCK_REGRESSION', 'Review time precedes the previous review.');
    const updated = scheduler(config).next(
      previous ? card(previous) : createEmptyCard(at),
      at,
      ratingMap[rating],
    ).card;
    return {
      adapterVersion,
      due: updated.due.toISOString(),
      stability: updated.stability,
      difficulty: updated.difficulty,
      elapsedDays: updated.elapsed_days,
      scheduledDays: updated.scheduled_days,
      learningSteps: updated.learning_steps,
      reps: updated.reps,
      lapses: updated.lapses,
      state: updated.state,
      lastReview: updated.last_review!.toISOString(),
      configVersion: config.version,
    };
  }
  retention(state: MemoryState, at: Date, config: StudyConfig): number {
    assertInstant(at);
    if (state.configVersion !== config.version)
      throw new DomainError(
        'MISSING_CONFIG_VERSION',
        "Use the memory state's original parameter configuration.",
      );
    if (at.getTime() < Date.parse(state.lastReview))
      throw new DomainError('CLOCK_REGRESSION', 'Evaluation precedes the review.');
    return scheduler(config).get_retrievability(card(state), at, false);
  }
  firstBelow(
    state: MemoryState,
    threshold: number,
    from: Date,
    through: Date,
    config: StudyConfig,
  ): Date | null {
    if (!(threshold > 0 && threshold < 1))
      throw new DomainError('INVALID_THRESHOLD', 'Threshold must lie between zero and one.');
    let low = Math.max(assertInstant(from).getTime(), Date.parse(state.lastReview));
    let high = assertInstant(through).getTime();
    if (low > high || this.retention(state, new Date(high), config) >= threshold) return null;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (this.retention(state, new Date(middle), config) < threshold) high = middle;
      else low = middle + 1;
    }
    return new Date(low);
  }
}
