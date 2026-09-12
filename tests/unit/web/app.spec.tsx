import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../../apps/web/src/app.js';
import {
  acceptResponseState,
  beginResponseFence,
  endResponseFence,
  StaleResponseError,
  acceptSession,
  captureResponseEpoch,
  assertResponseEpoch,
} from '../../../apps/web/src/services/state-guard.js';

const generation = '11111111-1111-4111-8111-111111111111';
const stateRevision = '1';
const recommendation = {
  id: '22222222-2222-4222-8222-222222222222',
  provider: 'leetcode',
  providerProblemId: '33',
  frontendId: '33',
  title: 'Search in Rotated Sorted Array',
  slug: 'search-in-rotated-sorted-array',
  url: 'https://leetcode.com/problems/search-in-rotated-sorted-array/',
  difficulty: 'Medium',
  primarySkill: { slug: 'binary-search', name: 'Binary Search' },
  tags: ['array', 'binary-search'],
  reason: 'PROGRESSION',
  issuedAt: '2026-09-12T12:00:00.000Z',
  status: 'ACTIVE',
  recordable: true,
};
const server = setupServer(
  http.get('http://localhost/api/v1/session', () =>
    HttpResponse.json({ databaseId: generation, generation, stateRevision }),
  ),
  http.get('http://localhost/api/v1/curriculum', () =>
    HttpResponse.json({
      generation,
      stateRevision,
      name: 'LeetCode 75',
      progressPercentage: 20,
      completedAnchors: 15,
      totalAnchors: 75,
    }),
  ),
  http.get('http://localhost/api/v1/recommendations', () =>
    HttpResponse.json({
      generation,
      stateRevision,
      items: [recommendation],
      refill: { status: 'READY', reason: null },
    }),
  ),
  http.get('http://localhost/api/v1/analytics/summary', () =>
    HttpResponse.json({
      generation,
      stateRevision,
      uniqueProblems: 3,
      totalAttempts: 4,
      currentStreak: 2,
      longestStreak: 3,
      medianDurationSeconds: 90,
      heatmap: [{ date: new Date().toISOString().slice(0, 10), count: 2 }],
      bySkill: [{ key: 'Binary Search', count: 4 }],
      byDifficulty: [{ key: 'Medium', count: 4 }],
      feedback: { independence: [], recognition: [], implementation: [], complexity: [] },
      evolution: [],
    }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  endResponseFence();
  localStorage.clear();
  window.history.replaceState({}, '', '/challenges');
});
afterAll(() => server.close());

test('renders the study queue and preserves cancel as a non-completion', async () => {
  const user = userEvent.setup();
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Retain DSA' })).toBeVisible();
  await waitFor(() => expect(document.body.textContent).toContain(recommendation.title));
  expect(screen.getByLabelText('20% complete')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Start' }));
  expect(screen.getByText('00:00:00')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Complete' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Pause' })).toBeVisible();
});

test('feedback traps Tab in both directions and Escape restores focus', async () => {
  const user = userEvent.setup();
  render(<App />);
  const complete = await screen.findByRole('button', { name: 'Complete' });
  await user.click(complete);
  await user.tab();
  expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  await user.tab({ shift: true });
  expect(screen.getByRole('button', { name: 'Save attempt' })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(complete).toHaveFocus();
});

test('analytics displays dated evolution with counts', async () => {
  server.use(
    http.get('http://localhost/api/v1/analytics/summary', () =>
      HttpResponse.json({
        generation,
        stateRevision,
        uniqueProblems: 1,
        totalAttempts: 2,
        currentStreak: 1,
        longestStreak: 1,
        medianDurationSeconds: null,
        heatmap: [],
        bySkill: [],
        byDifficulty: [],
        feedback: { independence: [], recognition: [], implementation: [], complexity: [] },
        evolution: [{ date: '2026-09-12', attempts: 2, cumulative: 2 }],
      }),
    ),
  );
  window.history.replaceState({}, '', '/analytics');
  render(<App />);
  expect(
    await screen.findByRole('table', { name: 'Attempts by local completion date' }),
  ).toBeVisible();
  expect(screen.getByRole('rowheader', { name: '2026-09-12' })).toBeVisible();
});

test.each([generation, '99999999-9999-4999-8999-999999999999'])(
  'recovers an ahead watermark for database generation %s without erasing its valid timer',
  async (storedGeneration) => {
    localStorage.setItem(
      'retain-dsa.state.v1',
      JSON.stringify({ generation: storedGeneration, stateRevision: '99999999' }),
    );
    localStorage.setItem(
      'retain-dsa.timer.v1',
      JSON.stringify({
        recommendationId: recommendation.id,
        generation,
        status: 'PAUSED',
        accumulatedSeconds: 17,
        startedAt: null,
      }),
    );
    render(<App />);
    expect(await screen.findByText(recommendation.title)).toBeVisible();
    expect(screen.getByText('00:00:17')).toBeVisible();
    expect(screen.getByText('Queue updated')).toBeVisible();
    expect(JSON.parse(localStorage.getItem('retain-dsa.state.v1')!).stateRevision).toBe('1');
  },
);

test('an old request cannot mutate a newly bootstrapped session', () => {
  const old = captureResponseEpoch();
  const current = beginResponseFence();
  acceptSession({ databaseId: generation, generation, stateRevision: '1' }, current);
  expect(() => assertResponseEpoch(old)).toThrow(StaleResponseError);
  expect(() =>
    acceptSession({ databaseId: generation, generation, stateRevision: '900' }, old),
  ).toThrow(StaleResponseError);
});

test.each(['READY', 'SHORTAGE'])(
  'an empty %s queue never claims it was updated',
  async (status) => {
    server.use(
      http.get('http://localhost/api/v1/recommendations', () =>
        HttpResponse.json({
          generation,
          stateRevision,
          items: [],
          refill: { status, reason: 'No matching free candidates.' },
        }),
      ),
    );
    render(<App />);
    expect(await screen.findByText('No matching free candidates.')).toBeVisible();
    expect(screen.queryByText('Queue updated')).not.toBeInTheDocument();
  },
);

test('polls refill to ready and keeps partial shortage cards visible', async () => {
  let calls = 0;
  server.use(
    http.get('http://localhost/api/v1/recommendations', () =>
      HttpResponse.json({
        generation,
        stateRevision,
        items: [recommendation],
        refill: {
          status: ++calls === 1 ? 'REFILLING' : 'SHORTAGE',
          reason: 'Supplemental discovery is unavailable.',
        },
      }),
    ),
  );
  render(<App />);
  expect(await screen.findByText(recommendation.title)).toBeVisible();
  expect(
    await screen.findByText('Supplemental discovery is unavailable.', {}, { timeout: 3000 }),
  ).toBeVisible();
  expect(screen.getByText(recommendation.title)).toBeVisible();
  expect(screen.queryByText('Queue updated')).not.toBeInTheDocument();
});

test.each([false, true])('reconciles a lost reset response, committed=%s', async (committed) => {
  const nextGeneration = '99999999-9999-4999-8999-999999999999';
  let reset = false;
  const current = () => (reset && committed ? nextGeneration : generation);
  server.use(
    http.get('http://localhost/api/v1/session', () =>
      HttpResponse.json({ databaseId: generation, generation: current(), stateRevision }),
    ),
    http.get('http://localhost/api/v1/recommendations', () =>
      HttpResponse.json({
        generation: current(),
        stateRevision,
        items: [recommendation],
        refill: { status: 'READY', reason: null },
      }),
    ),
    http.delete('http://localhost/api/v1/progress', () => {
      reset = true;
      return HttpResponse.error();
    }),
  );
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole('button', { name: 'Start' }));
  await user.click(screen.getByRole('button', { name: 'Reset progress' }));
  await user.type(screen.getByRole('textbox'), 'RESET');
  await user.click(screen.getByRole('button', { name: 'Delete progress' }));
  await waitFor(() => expect(reset).toBe(true));
  await waitFor(() =>
    expect(JSON.parse(localStorage.getItem('retain-dsa.state.v1')!).generation).toBe(current()),
  );
  if (committed)
    await waitFor(() => expect(localStorage.getItem('retain-dsa.timer.v1')).toBeNull());
  else expect(await screen.findByRole('button', { name: 'Pause' })).toBeVisible();
});

test('moves focus into the feedback modal and restores it on cancel', async () => {
  const user = userEvent.setup();
  render(<App />);
  expect(await screen.findByText(recommendation.title)).toBeVisible();
  const complete = screen.getByRole('button', { name: 'Complete' });
  await user.click(complete);
  expect(screen.getByRole('dialog')).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(complete).toHaveFocus();
});

test('discards stale revisions and responses that cross a reset fence', () => {
  acceptResponseState({ generation, stateRevision: '5' });
  expect(() => acceptResponseState({ generation, stateRevision: '4' })).toThrow(StaleResponseError);
  beginResponseFence();
  expect(() => acceptResponseState({ generation, stateRevision: '6' })).toThrow(StaleResponseError);
  endResponseFence();
  expect(acceptResponseState({ generation, stateRevision: '6' })).toEqual({
    generation,
    stateRevision: '6',
  });
});

test('recovers the queue after an out-of-order stale response', async () => {
  let recommendationCalls = 0;
  localStorage.setItem('retain-dsa.state.v1', JSON.stringify({ generation, stateRevision: '1' }));
  server.use(
    http.get('http://localhost/api/v1/curriculum', () =>
      HttpResponse.json({
        generation,
        stateRevision: '2',
        name: 'LeetCode 75',
        progressPercentage: 20,
        completedAnchors: 15,
        totalAnchors: 75,
      }),
    ),
    http.get('http://localhost/api/v1/analytics/summary', () =>
      HttpResponse.json({
        generation,
        stateRevision: '2',
        uniqueProblems: 3,
        totalAttempts: 4,
        currentStreak: 2,
        longestStreak: 3,
        medianDurationSeconds: 90,
        heatmap: [],
        bySkill: [],
        byDifficulty: [],
        feedback: { independence: [], recognition: [], implementation: [], complexity: [] },
        evolution: [],
      }),
    ),
    http.get('http://localhost/api/v1/recommendations', async () => {
      recommendationCalls += 1;
      const callNumber = recommendationCalls;
      if (callNumber === 1) await new Promise((resolve) => setTimeout(resolve, 10));
      return HttpResponse.json({
        generation,
        stateRevision: callNumber === 1 ? '1' : '2',
        items: [recommendation],
        refill: { status: 'READY', reason: null },
      });
    }),
  );

  render(<App />);

  await waitFor(() => expect(recommendationCalls).toBeGreaterThanOrEqual(2));
  expect(await screen.findByText(recommendation.title)).toBeVisible();
  expect(recommendationCalls).toBeGreaterThanOrEqual(2);
  expect(
    screen.queryByText('An outdated response was discarded. Refreshing local data.'),
  ).toBeNull();
  expect(screen.queryByText('No eligible challenges right now')).toBeNull();
});

test('retries a lost completion with one idempotency key and clears only after success', async () => {
  const keys: string[] = [];
  const payloads: unknown[] = [];
  let calls = 0;
  server.use(
    http.post('http://localhost/api/v1/attempts', async ({ request }) => {
      payloads.push(await request.json());
      keys.push(request.headers.get('idempotency-key') ?? '');
      calls += 1;
      if (calls === 1)
        return HttpResponse.json(
          { error: { code: 'TEMPORARY', message: 'Temporary failure.' } },
          { status: 503 },
        );
      return HttpResponse.json(
        {
          generation,
          stateRevision: '2',
          attempt: {
            id: '33333333-3333-4333-8333-333333333333',
            recommendationId: recommendation.id,
            completedAt: '2026-09-12T12:10:00.000Z',
            completedLocalDate: '2026-09-12',
            durationSeconds: 0,
            score: 1,
            rating: 'EASY',
          },
        },
        { status: 201 },
      );
    }),
  );
  const user = userEvent.setup();
  render(<App />);
  expect(await screen.findByText(recommendation.title)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Start' }));
  await user.click(screen.getByRole('button', { name: 'Complete' }));
  await user.click(screen.getByRole('button', { name: 'Save attempt' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Temporary failure.');
  expect(screen.getByLabelText(/Duration in seconds/)).toBeDisabled();
  expect(localStorage.getItem('retain-dsa.timer.v1')).not.toBeNull();
  await user.click(screen.getByRole('button', { name: 'Save attempt' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
  expect(payloads[1]).toEqual(payloads[0]);
  expect(localStorage.getItem('retain-dsa.timer.v1')).toBeNull();
});
