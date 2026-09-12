import { createApiClient, type paths } from '@retain/api-client';
import {
  acceptResponseState,
  acceptVersionHeaders,
  isStaleResponseError,
  acceptSession,
  beginResponseFence,
  captureResponseEpoch,
  assertResponseEpoch,
} from './state-guard.js';

// Resolve fetch when an operation starts so MSW and other test transports can
// install their interceptor after this module is imported.
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

let sessionRequest: Promise<Awaited<ReturnType<typeof fetchSession>>> | null = null;
let sessionEpoch = -1;
async function fetchSession(epoch: number, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(10000);
  const { data, error } = await client().GET('/api/v1/session', {
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!data) throw failure(error);
  signal?.throwIfAborted();
  acceptSession(data, epoch);
  return data;
}
export function synchronizeSession(signal?: AbortSignal) {
  if (!sessionRequest || sessionEpoch !== captureResponseEpoch()) {
    sessionEpoch = beginResponseFence();
    const pending = fetchSession(sessionEpoch, signal).finally(() => {
      if (sessionRequest === pending) sessionRequest = null;
    });
    sessionRequest = pending;
  }
  return sessionRequest;
}

async function retryStale<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try {
      return await operation();
    } catch (error) {
      if (!isStaleResponseError(error) || attempt >= 1) throw error;
      signal?.throwIfAborted();
      await synchronizeSession();
      signal?.throwIfAborted();
    }
  }
}

export async function getCurriculum(signal?: AbortSignal) {
  return retryStale(async () => {
    const epoch = captureResponseEpoch();
    const { data, error, response } = await client().GET('/api/v1/curriculum', {
      signal: signal ?? null,
    });
    signal?.throwIfAborted();
    assertResponseEpoch(epoch);
    acceptVersionHeaders(response);
    if (!data) throw failure(error);
    acceptResponseState(data);
    return data;
  }, signal);
}

export async function getRecommendations(signal?: AbortSignal) {
  return retryStale(async () => {
    const epoch = captureResponseEpoch();
    const { data, error, response } = await client().GET('/api/v1/recommendations', {
      signal: signal ?? null,
    });
    signal?.throwIfAborted();
    assertResponseEpoch(epoch);
    acceptVersionHeaders(response);
    if (!data) throw failure(error);
    acceptResponseState(data);
    return data;
  }, signal);
}

export async function getRecommendation(id: string, signal?: AbortSignal) {
  return retryStale(async () => {
    const epoch = captureResponseEpoch();
    const { data, error, response } = await client().GET('/api/v1/recommendations/{id}', {
      params: { path: { id } },
      signal: signal ?? null,
    });
    signal?.throwIfAborted();
    assertResponseEpoch(epoch);
    acceptVersionHeaders(response);
    if (!data) throw failure(error);
    acceptResponseState(data);
    return data;
  }, signal);
}

export async function getAnalytics(timezone: string, signal?: AbortSignal) {
  return retryStale(async () => {
    const epoch = captureResponseEpoch();
    const { data, error, response } = await client().GET('/api/v1/analytics/summary', {
      params: { query: { timezone } },
      signal: signal ?? null,
    });
    signal?.throwIfAborted();
    assertResponseEpoch(epoch);
    acceptVersionHeaders(response);
    if (!data) throw failure(error);
    acceptResponseState(data);
    return data;
  }, signal);
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
  const epoch = captureResponseEpoch();
  const { data, error, response } = await client().POST('/api/v1/attempts', {
    params: { header: { 'idempotency-key': idempotencyKey } },
    body: { ...body, feedbackSchemaVersion: 'feedback-v1' },
  });
  assertResponseEpoch(epoch);
  acceptVersionHeaders(response);
  if (!data) throw failure(error);
  acceptResponseState(data);
  return data;
}

export async function resetProgress(generation: string) {
  const epoch = captureResponseEpoch();
  const { error, response } = await client().DELETE('/api/v1/progress', {
    body: { confirmation: 'RESET', generation },
  });
  assertResponseEpoch(epoch);
  const state = acceptVersionHeaders(response, true);
  if (!response.ok) throw failure(error);
  if (!state) throw new Error('The server did not return the new progress version.');
  return state;
}

export type Curriculum = JsonResponse<'/api/v1/curriculum', 'get'>;
export type RecommendationList = JsonResponse<'/api/v1/recommendations', 'get'>;
export type Analytics = JsonResponse<'/api/v1/analytics/summary', 'get'>;
export type Recommendation = RecommendationList['items'][number];
