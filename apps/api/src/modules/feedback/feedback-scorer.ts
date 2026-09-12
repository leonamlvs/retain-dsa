import type { StudyConfig } from '../../config/study-config.schema.js';
import type { Feedback } from './feedback.schema.js';
export const ratings = ['AGAIN', 'HARD', 'GOOD', 'EASY'] as const;
export type MemoryRating = (typeof ratings)[number];
export interface Evidence {
  scoreUnits: number;
  score: number;
  rating: MemoryRating;
  cap: MemoryRating;
  scorerVersion: string;
  configVersion: string;
}
export function scoreFeedback(answers: Feedback, config: StudyConfig): Evidence {
  const { weights, values, boundaries, caps } = config.feedback;
  const scoreUnits =
    weights.independence * values.independence[answers.independence] +
    weights.recognition * values.recognition[answers.recognition] +
    weights.implementation * values.implementation[answers.implementation] +
    weights.complexity * values.complexity[answers.complexity];
  const rawIndex =
    scoreUnits < boundaries[0] * 10000
      ? 0
      : scoreUnits < boundaries[1] * 10000
        ? 1
        : scoreUnits < boundaries[2] * 10000
          ? 2
          : 3;
  let cap: MemoryRating = 'EASY';
  if (answers.independence !== 'INDEPENDENT') cap = caps[answers.independence];
  if (answers.implementation === 'UNABLE') cap = caps.UNABLE;
  const rating = ratings[Math.min(rawIndex, ratings.indexOf(cap))]!;
  return {
    scoreUnits,
    score: scoreUnits / 100_000_000,
    rating,
    cap,
    scorerVersion: config.scorerVersion,
    configVersion: config.version,
  };
}
