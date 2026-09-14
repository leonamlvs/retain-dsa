import { addCalendarDays, localDateAt, streaks } from '../../domain/calendar.js';
import { z } from 'zod';
import { feedbackSchema } from '../feedback/feedback.schema.js';

export const analyticsAttemptSchema = z.object({
  problemId: z.string(),
  difficulty: z.string(),
  completedLocalDate: z.coerce.date(),
  durationSeconds: z.number().nullable(),
  skill: z.object({ name: z.string() }),
  feedback: feedbackSchema,
});
export function computeAnalytics(
  input: unknown,
  query: { timezone: string; from?: string; to?: string },
  evaluationTime: Date,
) {
  const attempts = z.array(analyticsAttemptSchema).parse(input);
  const counts = (values: string[]) =>
    [...new Map(values.map((key) => [key, values.filter((item) => item === key).length])).entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => a.key.localeCompare(b.key));
  const dates = attempts.map((attempt) => attempt.completedLocalDate.toISOString().slice(0, 10));
  const today = localDateAt(evaluationTime, query.timezone);
  const from = query.from ?? addCalendarDays(today, -364);
  const to = query.to ?? today;
  const heatmap = counts(dates.filter((date) => date >= from && date <= to)).map(
    ({ key, count }) => ({ date: key, count }),
  );
  const { current, longest } = streaks(dates, today);
  const durations = attempts
    .flatMap((attempt) => (attempt.durationSeconds === null ? [] : [attempt.durationSeconds]))
    .sort((a, b) => a - b);
  const middle = Math.floor(durations.length / 2);
  const median =
    durations.length === 0
      ? null
      : durations.length % 2
        ? durations[middle]!
        : (durations[middle - 1]! + durations[middle]!) / 2;
  let cumulative = 0;
  return {
    uniqueProblems: new Set(attempts.map((item) => item.problemId)).size,
    totalAttempts: attempts.length,
    currentStreak: current,
    longestStreak: longest,
    medianDurationSeconds: median,
    heatmap,
    bySkill: counts(attempts.map((item) => item.skill.name)),
    byDifficulty: counts(attempts.map((item) => item.difficulty)),
    feedback: {
      independence: counts(attempts.map((item) => item.feedback!.independence)),
      recognition: counts(attempts.map((item) => item.feedback!.recognition)),
      implementation: counts(attempts.map((item) => item.feedback!.implementation)),
      complexity: counts(attempts.map((item) => item.feedback!.complexity)),
    },
    evolution: heatmap.map((item) => ({
      date: item.date,
      attempts: item.count,
      cumulative: (cumulative += item.count),
    })),
  };
}
