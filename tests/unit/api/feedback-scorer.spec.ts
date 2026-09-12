import { defaultConfig } from '../../../apps/api/src/config/default-config.js';
import { scoreFeedback, ratings } from '../../../apps/api/src/modules/feedback/feedback-scorer.js';
import {
  feedbackSchema,
  type Feedback,
} from '../../../apps/api/src/modules/feedback/feedback.schema.js';
const best: Feedback = {
  independence: 'INDEPENDENT',
  recognition: 'INDEPENDENT',
  implementation: 'SMOOTH',
  complexity: 'CORRECT',
};
test('every categorical combination obeys the strongest cap without rewriting answers', () => {
  let combinations = 0;
  for (const independence of feedbackSchema.shape.independence.options)
    for (const recognition of feedbackSchema.shape.recognition.options)
      for (const implementation of feedbackSchema.shape.implementation.options)
        for (const complexity of feedbackSchema.shape.complexity.options) {
          const input = Object.freeze({ independence, recognition, implementation, complexity });
          const result = scoreFeedback(input, defaultConfig);
          const cap =
            implementation === 'UNABLE' || ['FAILED', 'FULL_SOLUTION'].includes(independence)
              ? 0
              : independence === 'SUBSTANTIAL_HELP'
                ? 1
                : independence === 'ONE_HINT'
                  ? 2
                  : 3;
          expect(ratings.indexOf(result.rating)).toBeLessThanOrEqual(cap);
          expect(result.cap).toBe(ratings[cap]);
          expect(Number.isSafeInteger(result.scoreUnits)).toBe(true);
          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(1);
          combinations++;
        }
  expect(combinations).toBe(180);
});
test('independent but unable is AGAIN even with a high raw score', () => {
  expect(scoreFeedback({ ...best, implementation: 'UNABLE' }, defaultConfig)).toMatchObject({
    score: 0.8,
    rating: 'AGAIN',
    cap: 'AGAIN',
  });
});
test.each([
  [3999, 'AGAIN'],
  [4000, 'HARD'],
  [5999, 'HARD'],
  [6000, 'GOOD'],
  [8499, 'GOOD'],
  [8500, 'EASY'],
] as const)('continuous threshold at %i', (value, rating) => {
  const config = structuredClone(defaultConfig);
  config.feedback.values.independence.INDEPENDENT = value;
  config.feedback.values.recognition.INDEPENDENT = value;
  config.feedback.values.implementation.SMOOTH = value;
  config.feedback.values.complexity.CORRECT = value;
  expect(scoreFeedback(best, config).rating).toBe(rating);
});
