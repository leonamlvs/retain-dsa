import { createApiClient, type paths } from '@retain/api-client';

const client = () => createApiClient(window.location.origin);
type JsonResponse<
  Path extends keyof paths,
  Method extends keyof paths[Path],
> = paths[Path][Method] extends {
  responses: { 200: { content: { 'application/json': infer Body } } };
}
  ? Body
  : never;

function failure(error: unknown): Error {
  if (error && typeof error === 'object' && 'error' in error) {
    const value = (error as { error?: { message?: string } }).error;
    if (value?.message) return new Error(value.message);
  }
  return new Error('Unable to load local data.');
}

export async function getSession(signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(10000);
  const { data, error } = await client().GET('/api/v1/session', {
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!data) throw failure(error);
  signal?.throwIfAborted();
  return data;
}

export async function getCurriculum(signal?: AbortSignal) {
  const { data, error } = await client().GET('/api/v1/curriculum', { signal: signal ?? null });
  if (!data) throw failure(error);
  signal?.throwIfAborted();
  return data;
}

export async function getRecommendations(signal?: AbortSignal) {
  const { data, error } = await client().GET('/api/v1/recommendations', {
    signal: signal ?? null,
  });
  if (!data) throw failure(error);
  signal?.throwIfAborted();
  return data;
}

export async function getRecommendation(id: string, signal?: AbortSignal) {
  const { data, error } = await client().GET('/api/v1/recommendations/{id}', {
    params: { path: { id } },
    signal: signal ?? null,
  });
  if (!data) throw failure(error);
  signal?.throwIfAborted();
  return data;
}

export async function getAnalytics(timezone: string, signal?: AbortSignal) {
  const { data, error } = await client().GET('/api/v1/analytics/summary', {
    params: { query: { timezone } },
    signal: signal ?? null,
  });
  if (!data) throw failure(error);
  signal?.throwIfAborted();
  return data;
}

export async function saveAttempt(input: {
  recommendationId: string;
  generation: string;
  idempotencyKey: string;
  answers: {
    independence: 'FAILED' | 'FULL_SOLUTION' | 'SUBSTANTIAL_HELP' | 'ONE_HINT' | 'INDEPENDENT';
    recognition: 'NOT_RECOGNIZED' | 'AFTER_HELP' | 'INDEPENDENT';
    implementation: 'UNABLE' | 'MAJOR_DIFFICULTY' | 'MINOR_DIFFICULTY' | 'SMOOTH';
    complexity: 'UNABLE' | 'PARTIAL' | 'CORRECT';
  };
  durationSeconds: number | null;
  timezone: string;
}) {
  const { idempotencyKey, ...body } = input;
  const { data, error } = await client().POST('/api/v1/attempts', {
    params: { header: { 'idempotency-key': idempotencyKey } },
    body: { ...body, feedbackSchemaVersion: 'feedback-v1' },
  });
  if (!data) throw failure(error);
  return data;
}

export async function resetProgress(generation: string) {
  const { data, error } = await client().DELETE('/api/v1/progress', {
    body: { confirmation: 'RESET', generation },
  });
  if (!data) throw failure(error);
  return data;
}

export type Session = JsonResponse<'/api/v1/session', 'get'>;
export type Curriculum = JsonResponse<'/api/v1/curriculum', 'get'>;
export type RecommendationList = JsonResponse<'/api/v1/recommendations', 'get'>;
export type Analytics = JsonResponse<'/api/v1/analytics/summary', 'get'>;
export type Recommendation = RecommendationList['items'][number];
