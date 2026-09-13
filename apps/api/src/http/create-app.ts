import { randomUUID } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { z, ZodError } from 'zod';
import { DomainError } from '../domain/domain-error.js';
import type { StudyService } from '../modules/study/study-service.interface.js';
import type { Logger } from '../shared/observability/logger.interface.js';
import { errorDetails } from '../shared/observability/error-details.js';
import { healthSchema } from './health.schema.js';
import { openApiDocument } from './openapi.js';
import {
  analyticsQuerySchema,
  analyticsResponseSchema,
  attemptResponseSchema,
  createAttemptSchema,
  curriculumResponseSchema,
  evolutionResponseSchema,
  heatmapResponseSchema,
  recommendationDetailSchema,
  recommendationsResponseSchema,
  resetProgressSchema,
  resetProgressResponseSchema,
  skillsResponseSchema,
  sessionResponseSchema,
} from '../modules/study/study.schema.js';

function validateOutput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error('Application service returned an invalid response.');
  return parsed.data;
}

function statusFor(code: string): number {
  if (
    ['STALE_GENERATION', 'IDEMPOTENCY_PAYLOAD_CHANGED', 'RECOMMENDATION_ALREADY_RECORDED'].includes(
      code,
    )
  )
    return 409;
  if (code === 'RECOMMENDATION_NOT_RECORDABLE' || code === 'RECOMMENDATION_NOT_FOUND') return 404;
  if (code === 'CLOCK_REGRESSION') return 503;
  return 400;
}

export function createApp(
  study: StudyService,
  logger: Logger,
  providerHealth: () => 'available' | 'degraded' | 'unknown' = () => 'unknown',
  requestRefill: () => void = () => undefined,
) {
  const app = express();
  app.disable('x-powered-by');
  app.use((request, response, next) => {
    const requestId = request.header('x-request-id') || randomUUID();
    response.set('X-Request-Id', requestId);
    response.locals.requestId = requestId;
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', (_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/v1/session', async (_request, response) => {
    const body = validateOutput(sessionResponseSchema, await study.session());
    response.json(body);
  });
  app.get('/health', async (_request, response) => {
    const database = await study.health();
    const provider = providerHealth();
    response.status(database === 'up' ? 200 : 503).json(
      validateOutput(healthSchema, {
        status:
          database === 'down' ? 'unhealthy' : provider === 'degraded' ? 'degraded' : 'healthy',
        database,
        provider,
      }),
    );
  });
  app.get('/openapi.json', (_request, response) => response.json(openApiDocument()));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument()));
  app.get('/api/v1/curriculum', async (_request, response) => {
    const body = validateOutput(curriculumResponseSchema, await study.curriculum());
    response.json(body);
  });
  app.get('/api/v1/recommendations', async (_request, response) => {
    const body = validateOutput(recommendationsResponseSchema, await study.recommendations());
    response.json(body);
  });
  app.get('/api/v1/recommendations/:id', async (request, response) => {
    const id = z.string().uuid().parse(request.params.id);
    const found = await study.recommendation(id);
    const body = found ? validateOutput(recommendationDetailSchema, found) : null;
    if (!body) {
      return response.status(404).json({
        error: { code: 'RECOMMENDATION_NOT_FOUND', message: 'Recommendation not found.' },
      });
    }
    return response.json(body);
  });
  app.post('/api/v1/attempts', async (request, response) => {
    const key = request.header('idempotency-key');
    if (!key || key.length > 200)
      throw new DomainError('INVALID_IDEMPOTENCY_KEY', 'A valid Idempotency-Key is required.');
    if (request.body?.feedbackSchemaVersion !== 'feedback-v1')
      throw new DomainError(
        'UNSUPPORTED_FEEDBACK_SCHEMA',
        'The feedback schema version is not supported.',
      );
    const result = await study.complete(createAttemptSchema.parse(request.body), key);
    const body = validateOutput(attemptResponseSchema, result.body);
    response.status(result.status).json(body);
    if (result.status === 201) requestRefill();
  });
  app.get('/api/v1/analytics/summary', async (request, response) => {
    const body = validateOutput(
      analyticsResponseSchema,
      await study.analytics(analyticsQuerySchema.parse(request.query)),
    );
    response.json(body);
  });
  app.get('/api/v1/analytics/heatmap', async (request, response) => {
    const body = await study.analytics(analyticsQuerySchema.parse(request.query));
    response.json(
      validateOutput(heatmapResponseSchema, {
        generation: body.generation,
        heatmap: body.heatmap,
      }),
    );
  });
  app.get('/api/v1/analytics/skills', async (request, response) => {
    const body = await study.analytics(analyticsQuerySchema.parse(request.query));
    response.json(
      validateOutput(skillsResponseSchema, {
        generation: body.generation,
        bySkill: body.bySkill,
        byDifficulty: body.byDifficulty,
      }),
    );
  });
  app.get('/api/v1/analytics/evolution', async (request, response) => {
    const body = await study.analytics(analyticsQuerySchema.parse(request.query));
    response.json(
      validateOutput(evolutionResponseSchema, {
        generation: body.generation,
        evolution: body.evolution,
      }),
    );
  });
  app.delete('/api/v1/progress', async (request, response) => {
    const input = resetProgressSchema.parse(request.body);
    const body = validateOutput(resetProgressResponseSchema, await study.reset(input.generation));
    response.status(200).json(body);
    requestRefill();
  });
  app.use('/api', (_request, response) =>
    response.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found.' } }),
  );
  app.use(async (error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    void _next;
    const requestId = response.locals.requestId as string | undefined;
    const requestContext = {
      requestId,
      method: _request.method,
      path: _request.path,
    };
    if (error instanceof ZodError) {
      logger.error('request.failed', {
        ...requestContext,
        code: 'VALIDATION_ERROR',
        error: errorDetails(error),
      });
      return response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request.', details: error.issues },
      });
    }
    if (error instanceof DomainError) {
      logger.error('request.failed', {
        ...requestContext,
        code: error.code,
        error: errorDetails(error),
      });
      return response
        .status(statusFor(error.code))
        .json({ error: { code: error.code, message: error.message } });
    }
    logger.error('request.failed', {
      ...requestContext,
      code: 'INTERNAL_ERROR',
      error: errorDetails(error),
    });
    return response
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error.' } });
  });
  return app;
}
