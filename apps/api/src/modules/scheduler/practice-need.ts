import type { StudyConfig } from '../../config/study-config.schema.js';
import type { Difficulty } from '../../domain/catalog.schema.js';
import type { MemoryEngine, MemoryState } from '../memory/memory-engine.interface.js';
import {
  currentEligibility,
  type EligibilityAttempt,
  type EligibilityResult,
  type SupplyFact,
} from './eligibility.js';

const difficultyOrder: Difficulty[] = ['Easy', 'Medium', 'Hard'];

export interface ConfigurationPeriod {
  activatedAt: string;
  config: StudyConfig;
}

export interface DifficultyMemory {
  difficulty: Difficulty;
  state: MemoryState;
}

export interface PracticeNeed {
  difficulty: Difficulty;
  reason: 'PROGRESSION' | 'REVIEW' | 'REVALIDATION';
  admission: EligibilityResult['admission'];
  regressionBoundary: string | null;
  urgencyRetention: number | null;
}

function activePeriods(
  periods: readonly ConfigurationPeriod[],
  through: Date,
): ConfigurationPeriod[] {
  return periods
    .filter((period) => Date.parse(period.activatedAt) <= through.getTime())
    .sort((a, b) => Date.parse(a.activatedAt) - Date.parse(b.activatedAt));
}

export function deterministicRegressionBoundary(
  state: MemoryState,
  periods: readonly ConfigurationPeriod[],
  through: Date,
  memory: MemoryEngine,
): Date | null {
  const timeline = activePeriods(periods, through);
  const memoryConfig = timeline.find(
    (period) => period.config.version === state.configVersion,
  )?.config;
  if (!memoryConfig) throw new Error(`Missing historical configuration ${state.configVersion}.`);
  const reviewedAt = new Date(state.lastReview);
  for (const [index, period] of timeline.entries()) {
    const start = new Date(Math.max(reviewedAt.getTime(), Date.parse(period.activatedAt)));
    const next = timeline[index + 1];
    const end = new Date(
      Math.min(through.getTime(), next ? Date.parse(next.activatedAt) - 1 : through.getTime()),
    );
    if (start > end) continue;
    const crossing = memory.firstBelow(
      state,
      period.config.scheduler.regressionThreshold,
      start,
      end,
      memoryConfig,
    );
    if (crossing) return crossing;
  }
  return null;
}

function freshProof(fact: SupplyFact | undefined, at: Date): boolean {
  return Boolean(fact?.complete && Date.parse(fact.validUntil) > at.getTime());
}

export function resolvePracticeNeed(input: {
  officialDifficulties: readonly Difficulty[];
  attempts: readonly EligibilityAttempt[];
  supply: readonly SupplyFact[];
  memories: readonly DifficultyMemory[];
  configurations: readonly ConfigurationPeriod[];
  evaluationTime: Date;
  memory: MemoryEngine;
  positiveRequired?: number;
  historicalAdmissions?: readonly EligibilityResult[];
}): PracticeNeed | null {
  const eligibility = currentEligibility(
    input.officialDifficulties,
    input.attempts,
    input.supply,
    input.evaluationTime,
    input.positiveRequired,
    input.historicalAdmissions,
  );
  if (!eligibility) return null;
  // An unattempted promoted tier still depends on the freshness of its lower evidence.
  const evidenceMemory =
    input.memories.find((item) => item.difficulty === eligibility.difficulty) ??
    [...input.memories]
      .filter(
        (item) =>
          difficultyOrder.indexOf(item.difficulty) <
          difficultyOrder.indexOf(eligibility.difficulty),
      )
      .sort(
        (a, b) => difficultyOrder.indexOf(b.difficulty) - difficultyOrder.indexOf(a.difficulty),
      )[0];
  const state = evidenceMemory?.state;
  if (!state)
    return {
      difficulty: eligibility.difficulty,
      reason: 'PROGRESSION',
      admission: eligibility.admission,
      regressionBoundary: null,
      urgencyRetention: null,
    };
  const lastAttempt = [...input.attempts]
    .filter((attempt) => attempt.difficulty === evidenceMemory?.difficulty)
    .sort((a, b) =>
      a.sourceSequence < b.sourceSequence ? -1 : a.sourceSequence > b.sourceSequence ? 1 : 0,
    )
    .at(-1);
  const boundary =
    lastAttempt?.rating === 'AGAIN'
      ? new Date(lastAttempt.completedAt)
      : deterministicRegressionBoundary(
          state,
          input.configurations,
          input.evaluationTime,
          input.memory,
        );
  const stateConfig = input.configurations.find(
    (item) => item.config.version === state.configVersion,
  )?.config;
  if (!stateConfig) throw new Error(`Missing historical configuration ${state.configVersion}.`);
  const urgencyRetention = input.memory.retention(state, input.evaluationTime, stateConfig);
  if (!boundary)
    return {
      difficulty: eligibility.difficulty,
      reason: input.memories.some((item) => item.difficulty === eligibility.difficulty)
        ? 'REVIEW'
        : 'PROGRESSION',
      admission: eligibility.admission,
      regressionBoundary: null,
      urgencyRetention,
    };

  const currentIndex = difficultyOrder.indexOf(eligibility.difficulty);
  for (let index = currentIndex - 1; index >= 0; index--) {
    const lower = difficultyOrder[index]!;
    const official = input.officialDifficulties.includes(lower);
    const proof = input.supply.find((fact) => fact.difficulty === lower);
    if (!official && freshProof(proof, input.evaluationTime) && proof!.candidateCount === 0)
      continue;
    if (!official && !freshProof(proof, input.evaluationTime)) return null;
    const lowerState = input.memories.find((item) => item.difficulty === lower)?.state;
    const lowerConfig = lowerState
      ? input.configurations.find((item) => item.config.version === lowerState.configVersion)
          ?.config
      : undefined;
    const positiveAfterBoundary = input.attempts.some(
      (attempt) =>
        attempt.difficulty === lower &&
        (attempt.rating === 'GOOD' || attempt.rating === 'EASY') &&
        Date.parse(attempt.completedAt) >= boundary.getTime(),
    );
    const healthy =
      lowerState &&
      lowerConfig &&
      input.memory.retention(lowerState, input.evaluationTime, lowerConfig) >=
        activePeriods(input.configurations, input.evaluationTime).at(-1)!.config.scheduler
          .reviewThreshold;
    if (positiveAfterBoundary && healthy)
      return {
        difficulty: eligibility.difficulty,
        reason: 'REVALIDATION',
        admission: eligibility.admission,
        regressionBoundary: boundary.toISOString(),
        urgencyRetention,
      };
    return {
      difficulty: lower,
      reason: 'REVALIDATION',
      admission: eligibility.admission,
      regressionBoundary: boundary.toISOString(),
      urgencyRetention,
    };
  }
  return {
    difficulty: eligibility.difficulty,
    reason: 'REVALIDATION',
    admission: eligibility.admission,
    regressionBoundary: boundary.toISOString(),
    urgencyRetention,
  };
}
