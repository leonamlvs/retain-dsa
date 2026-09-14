import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { healthSchema } from './health.schema.js';
import {
  analyticsResponseSchema,
  analyticsQuerySchema,
  attemptResponseSchema,
  createAttemptSchema,
  curriculumResponseSchema,
  errorResponseSchema,
  evolutionResponseSchema,
  heatmapResponseSchema,
  recommendationDetailSchema,
  recommendationsResponseSchema,
  resetProgressSchema,
  resetProgressResponseSchema,
  skillsResponseSchema,
  sessionResponseSchema,
} from '../modules/study/study.schema.js';
extendZodWithOpenApi(z);
export function openApiDocument() {
  const registry = new OpenAPIRegistry();
  const error = {
    description: 'Application error.',
    content: { 'application/json': { schema: errorResponseSchema } },
  };
  const json = (description: string, schema: z.ZodType) => ({
    description,
    content: { 'application/json': { schema } },
  });
  const analyticsRequest = { query: analyticsQuerySchema };
  registry.registerPath({
    method: 'get',
    path: '/api/v1/session',
    operationId: 'getSession',
    summary: 'Current progress generation',
    responses: {
      200: json('Current progress generation; Cache-Control: no-store.', sessionResponseSchema),
      500: error,
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/health',
    operationId: 'getHealth',
    summary: 'Local runtime capability',
    responses: {
      200: {
        description: 'Database available; provider may be degraded.',
        content: { 'application/json': { schema: healthSchema } },
      },
      503: {
        description: 'Database unavailable or not configured.',
        content: { 'application/json': { schema: healthSchema } },
      },
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/analytics/heatmap',
    operationId: 'getHeatmap',
    request: analyticsRequest,
    responses: {
      200: json('Stored local-date activity.', heatmapResponseSchema),
      400: error,
      500: error,
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/analytics/skills',
    operationId: 'getSkillAnalytics',
    request: analyticsRequest,
    responses: {
      200: json('Skill and difficulty distributions.', skillsResponseSchema),
      400: error,
      500: error,
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/analytics/evolution',
    operationId: 'getEvolution',
    request: analyticsRequest,
    responses: { 200: json('Attempt evolution.', evolutionResponseSchema), 400: error, 500: error },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/curriculum',
    operationId: 'getCurriculum',
    responses: {
      200: json('Current curriculum progress.', curriculumResponseSchema),
      400: error,
      500: error,
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/recommendations',
    operationId: 'getRecommendations',
    responses: {
      200: json('Persisted active recommendations.', recommendationsResponseSchema),
      500: error,
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/recommendations/{id}',
    operationId: 'getRecommendation',
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: json('Issued recommendation snapshot.', recommendationDetailSchema),
      400: error,
      404: error,
      500: error,
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/attempts',
    operationId: 'createAttempt',
    request: {
      headers: z.object({ 'idempotency-key': z.string().min(1).max(200) }),
      body: { content: { 'application/json': { schema: createAttemptSchema } } },
    },
    responses: {
      404: error,
      201: json('Attempt saved.', attemptResponseSchema),
      200: json('Idempotent replay.', attemptResponseSchema),
      400: error,
      409: error,
      503: error,
      500: error,
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/analytics/summary',
    operationId: 'getAnalytics',
    request: analyticsRequest,
    responses: {
      200: json('Attempt-based analytics.', analyticsResponseSchema),
      400: error,
      500: error,
    },
  });
  registry.registerPath({
    method: 'delete',
    path: '/api/v1/progress',
    operationId: 'resetProgress',
    request: { body: { content: { 'application/json': { schema: resetProgressSchema } } } },
    responses: {
      200: json('Progress reset.', resetProgressResponseSchema),
      400: error,
      409: error,
      503: error,
      500: error,
    },
  });
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: { title: 'Retain DSA', version: '0.1.0' },
  });
}
