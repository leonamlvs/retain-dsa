import request from 'supertest';
import { jest } from '@jest/globals';
import { createApp } from '../../../apps/api/src/http/create-app.js';
import type { StudyService } from '../../../apps/api/src/modules/study/study-service.interface.js';
import { NoOpLogger } from '../../../apps/api/src/shared/observability/logger.interface.js';
import { DomainError } from '../../../apps/api/src/domain/domain-error.js';

const generation = '11111111-1111-4111-8111-111111111111';
test('errors do not expose internal revision state or trigger a later curriculum read', async () => {
  const study = service();
  const failure = new DomainError('CLOCK_REGRESSION', 'Clock moved backwards.');
  study.recommendations = async () => {
    throw failure;
  };
  study.curriculum = jest.fn(study.curriculum);
  const response = await request(createApp(study, new NoOpLogger()))
    .get('/api/v1/recommendations')
    .expect(503);
  expect(response.headers['x-state-revision']).toBeUndefined();
  expect(response.headers['x-progress-generation']).toBeUndefined();
  expect(study.curriculum).not.toHaveBeenCalled();
});
function service(status: 200 | 201 = 201): StudyService {
  return {
    session: async () => ({ generation }),
    health: async () => 'up',
    curriculum: async () => ({
      generation,
      name: 'LeetCode 75',
      progressPercentage: 20,
      completedAnchors: 15,
      totalAnchors: 75,
    }),
    recommendations: async () => ({
      generation,
      items: [],
      refill: { status: 'SHORTAGE', targetSize: 5, reason: 'NO_ELIGIBLE_CANDIDATE' },
    }),
    recommendation: async () => null,
    complete: async (input) => ({
      status,
      body: {
        generation,
        attempt: {
          id: '22222222-2222-4222-8222-222222222222',
          recommendationId: input.recommendationId,
          completedAt: '2026-09-12T12:00:00.000Z',
          completedLocalDate: '2026-09-12',
          durationSeconds: input.durationSeconds ?? null,
          score: 1,
          rating: 'EASY',
        },
      },
    }),
    analytics: async () => ({
      generation,
      uniqueProblems: 0,
      totalAttempts: 0,
      currentStreak: 0,
      longestStreak: 0,
      medianDurationSeconds: null,
      heatmap: [],
      bySkill: [],
      byDifficulty: [],
      feedback: { independence: [], recognition: [], implementation: [], complexity: [] },
      evolution: [],
    }),
    reset: async () => ({ generation: '33333333-3333-4333-8333-333333333333' }),
  };
}

test('serves an uncached generation-only session', async () => {
  const response = await request(createApp(service(), new NoOpLogger()))
    .get('/api/v1/session')
    .expect(200);
  expect(response.body).toEqual({ generation });
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['x-state-revision']).toBeUndefined();
  expect(response.headers['x-progress-generation']).toBeUndefined();
});

test('serves generation-scoped state without snapshot headers', async () => {
  const response = await request(createApp(service(), new NoOpLogger()))
    .get('/api/v1/curriculum')
    .expect(200);
  expect(response.body.generation).toBe(generation);
  expect(response.headers['x-progress-generation']).toBeUndefined();
  expect(response.headers['x-state-revision']).toBeUndefined();
  expect(response.body.progressPercentage).toBe(20);
  expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
});

test('returns the new generation as JSON after reset', async () => {
  const response = await request(createApp(service(), new NoOpLogger()))
    .delete('/api/v1/progress')
    .send({ confirmation: 'RESET', generation })
    .expect(200);
  expect(response.body).toEqual({ generation: '33333333-3333-4333-8333-333333333333' });
  expect(response.headers['x-state-revision']).toBeUndefined();
});

test('validates analytics timezone and bounded date ranges', async () => {
  await request(createApp(service(), new NoOpLogger()))
    .get('/api/v1/analytics/summary')
    .query({ timezone: 'America/Sao_Paulo', from: '2026-01-01', to: '2026-12-31' })
    .expect(200);
  const invalid = await request(createApp(service(), new NoOpLogger()))
    .get('/api/v1/analytics/summary')
    .query({ timezone: '+03:00', from: '2026-01-01' })
    .expect(400);
  expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
});

test('validates attempts and forwards the idempotency key', async () => {
  const recommendationId = '44444444-4444-4444-8444-444444444444';
  const response = await request(createApp(service(), new NoOpLogger()))
    .post('/api/v1/attempts')
    .set('Idempotency-Key', 'attempt-one')
    .send({
      recommendationId,
      generation,
      feedbackSchemaVersion: 'feedback-v1',
      answers: {
        independence: 'INDEPENDENT',
        recognition: 'INDEPENDENT',
        implementation: 'SMOOTH',
        complexity: 'CORRECT',
      },
      durationSeconds: 0,
      timezone: 'America/Sao_Paulo',
    })
    .expect(201);
  expect(response.body.attempt).toMatchObject({
    recommendationId,
    durationSeconds: 0,
    rating: 'EASY',
  });
});

test('does not request refill for an idempotent replay', async () => {
  const requestRefill = jest.fn();
  await request(createApp(service(200), new NoOpLogger(), undefined, requestRefill))
    .post('/api/v1/attempts')
    .set('Idempotency-Key', 'attempt-replay')
    .send({
      recommendationId: '44444444-4444-4444-8444-444444444444',
      generation,
      feedbackSchemaVersion: 'feedback-v1',
      answers: {
        independence: 'INDEPENDENT',
        recognition: 'INDEPENDENT',
        implementation: 'SMOOTH',
        complexity: 'CORRECT',
      },
      durationSeconds: 0,
      timezone: 'America/Sao_Paulo',
    })
    .expect(200);
  expect(requestRefill).not.toHaveBeenCalled();
});

test('keeps unknown API routes in the JSON boundary', async () => {
  const response = await request(createApp(service(), new NoOpLogger()))
    .get('/api/unknown')
    .expect(404);
  expect(response.type).toMatch(/json/);
  expect(response.body.error.code).toBe('NOT_FOUND');
});

test('reports provider degradation without marking the database unhealthy', async () => {
  const response = await request(createApp(service(), new NoOpLogger(), () => 'degraded'))
    .get('/health')
    .expect(200);
  expect(response.body).toEqual({ status: 'degraded', database: 'up', provider: 'degraded' });
});
