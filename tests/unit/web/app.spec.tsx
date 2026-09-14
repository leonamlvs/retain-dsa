import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../../apps/web/src/app.js';

const generation = '11111111-1111-4111-8111-111111111111';
const nextGeneration = '99999999-9999-4999-8999-999999999999';
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
const otherRecommendation = {
  ...recommendation,
  id: '33333333-3333-4333-8333-333333333333',
  providerProblemId: '34',
  frontendId: '34',
  title: 'Find First and Last Position',
  slug: 'find-first-and-last-position',
  url: 'https://leetcode.com/problems/find-first-and-last-position/',
};

function localIsoDate() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

const analytics = (scope = generation) => ({
  generation: scope,
  uniqueProblems: 3,
  totalAttempts: 4,
  currentStreak: 2,
  longestStreak: 3,
  medianDurationSeconds: 90,
  heatmap: [{ date: localIsoDate(), count: 2 }],
  bySkill: [{ key: 'Binary Search', count: 4 }],
  byDifficulty: [{ key: 'Medium', count: 4 }],
  feedback: { independence: [], recognition: [], implementation: [], complexity: [] },
  evolution: [],
});

const server = setupServer(
  http.get('http://localhost/api/v1/session', () => HttpResponse.json({ generation })),
  http.get('http://localhost/api/v1/curriculum', () =>
    HttpResponse.json({
      generation,
      name: 'LeetCode 75',
      progressPercentage: 20,
      completedAnchors: 15,
      totalAnchors: 75,
    }),
  ),
  http.get('http://localhost/api/v1/recommendations', () =>
    HttpResponse.json({
      generation,
      items: [recommendation],
      refill: { status: 'READY', reason: null },
    }),
  ),
  http.get('http://localhost/api/v1/analytics/summary', () => HttpResponse.json(analytics())),
);

async function completeFeedback(user: ReturnType<typeof userEvent.setup>) {
  const values = ['INDEPENDENT', 'INDEPENDENT', 'SMOOTH', 'CORRECT'];
  const fields = screen.getAllByRole('combobox');
  for (const [index, field] of fields.entries()) await user.selectOptions(field, values[index]!);
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
  window.history.replaceState({}, '', '/challenges');
});
afterAll(() => server.close());

test('renders the queue and cancel preserves the running timer without completing', async () => {
  const user = userEvent.setup();
  render(<App />);
  expect(screen.getByRole('link', { name: 'Retain DSA' })).toBeVisible();
  expect(await screen.findByText(recommendation.title)).toBeVisible();
  expect(screen.getByLabelText('20% complete')).toBeVisible();
  expect(screen.queryByText(/of 75 problems completed/)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Start timer' }));
  await user.click(screen.getByRole('button', { name: 'Complete' }));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Pause' })).toBeVisible();
});

test('feedback traps focus and Escape restores the Complete action', async () => {
  const user = userEvent.setup();
  render(<App />);
  const complete = await screen.findByRole('button', { name: 'Complete' });
  await user.click(complete);
  await user.tab();
  expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  await user.tab({ shift: true });
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(complete).toHaveFocus();
});

test('analytics displays dated evolution with counts', async () => {
  server.use(
    http.get('http://localhost/api/v1/analytics/summary', () =>
      HttpResponse.json({
        ...analytics(),
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

test('keeps the practice queue usable when analytics is unavailable', async () => {
  server.use(
    http.get('http://localhost/api/v1/analytics/summary', () =>
      HttpResponse.json(
        { error: { code: 'TEMPORARY', message: 'Analytics unavailable.' } },
        { status: 503 },
      ),
    ),
  );
  render(<App />);
  expect(await screen.findByText(recommendation.title)).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent('Activity unavailable');
  expect(screen.getByLabelText('Current streak unavailable')).toHaveTextContent('—');
  expect(screen.queryByText('0 attempts in the last 12 months')).not.toBeInTheDocument();
});

test('activity calendar exposes one tab stop and moves focus by day', async () => {
  const user = userEvent.setup();
  render(<App />);
  const active = await screen.findByRole('gridcell', { name: /2 attempts/ });
  const cells = screen.getAllByRole('gridcell');
  expect(cells.filter((cell) => cell.tabIndex === 0)).toEqual([active]);
  active.focus();
  await user.keyboard('{ArrowUp}');
  const previous = new Date(`${localIsoDate()}T00:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  const previousLabel = new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(previous);
  expect(screen.getByRole('gridcell', { name: `${previousLabel}: 0 attempts` })).toHaveFocus();
});

test.each([false, true])(
  'clears a %s timer and immediately transfers ownership',
  async (paused) => {
    server.use(
      http.get('http://localhost/api/v1/recommendations', () =>
        HttpResponse.json({
          generation,
          items: [recommendation, otherRecommendation],
          refill: { status: 'READY', reason: null },
        }),
      ),
    );
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText(otherRecommendation.title)).toBeVisible();
    const starts = screen.getAllByRole('button', { name: 'Start timer' });
    await user.click(starts[0]!);
    expect(screen.getByRole('button', { name: 'Start timer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Start timer' })).toHaveAttribute(
      'title',
      'Clear the current timer first',
    );
    if (paused) await user.click(screen.getByRole('button', { name: 'Pause' }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(localStorage.getItem('retain-dsa.timer.v1')).toBeNull();
    const available = screen.getAllByRole('button', { name: 'Start timer' });
    expect(available).toHaveLength(2);
    await user.click(available[1]!);
    expect(JSON.parse(localStorage.getItem('retain-dsa.timer.v1')!)).toMatchObject({
      recommendationId: otherRecommendation.id,
      generation,
      status: 'RUNNING',
    });
  },
);

test('removes the obsolete watermark and restores a valid persisted timer', async () => {
  localStorage.setItem('retain-dsa.state.v1', JSON.stringify({ stateRevision: '999999' }));
  localStorage.setItem(
    'retain-dsa.timer.v1',
    JSON.stringify({
      recommendationId: recommendation.id,
      generation,
      status: 'PAUSED',
      accumulatedSeconds: 17,
      startedAt: null,
      databaseId: 'legacy-value',
    }),
  );
  render(<App />);
  expect(await screen.findByText('00:00:17')).toBeVisible();
  await waitFor(() => expect(localStorage.getItem('retain-dsa.state.v1')).toBeNull());
});

test.each([false, true])('reconciles a lost reset response, committed=%s', async (committed) => {
  let resetRequested = false;
  const currentGeneration = () => (resetRequested && committed ? nextGeneration : generation);
  server.use(
    http.get('http://localhost/api/v1/session', () =>
      HttpResponse.json({ generation: currentGeneration() }),
    ),
    http.get('http://localhost/api/v1/curriculum', () =>
      HttpResponse.json({
        generation: currentGeneration(),
        name: 'LeetCode 75',
        progressPercentage: 0,
        completedAnchors: 0,
        totalAnchors: 75,
      }),
    ),
    http.get('http://localhost/api/v1/recommendations', () =>
      HttpResponse.json({
        generation: currentGeneration(),
        items: [recommendation],
        refill: { status: 'READY', reason: null },
      }),
    ),
    http.get('http://localhost/api/v1/analytics/summary', () =>
      HttpResponse.json(analytics(currentGeneration())),
    ),
    http.delete('http://localhost/api/v1/progress', () => {
      resetRequested = true;
      return HttpResponse.error();
    }),
  );
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole('button', { name: 'Start timer' }));
  await user.click(screen.getByRole('button', { name: 'Reset progress' }));
  await user.type(screen.getByRole('textbox'), 'RESET');
  await user.click(screen.getByRole('button', { name: 'Delete progress' }));
  await waitFor(() => expect(resetRequested).toBe(true));
  if (committed) {
    await waitFor(() => expect(localStorage.getItem('retain-dsa.timer.v1')).toBeNull());
    expect(await screen.findByRole('button', { name: 'Start timer' })).toBeVisible();
  } else {
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeVisible();
    expect(localStorage.getItem('retain-dsa.timer.v1')).not.toBeNull();
  }
});

test('an older request cannot overwrite the new generation after reset', async () => {
  let currentGeneration = generation;
  let recommendationCalls = 0;
  let releaseOldRequest!: () => void;
  const oldRequest = new Promise<void>((resolve) => (releaseOldRequest = resolve));
  server.use(
    http.get('http://localhost/api/v1/session', () =>
      HttpResponse.json({ generation: currentGeneration }),
    ),
    http.get('http://localhost/api/v1/curriculum', () =>
      HttpResponse.json({
        generation: currentGeneration,
        name: 'LeetCode 75',
        progressPercentage: 0,
        completedAnchors: 0,
        totalAnchors: 75,
      }),
    ),
    http.get('http://localhost/api/v1/analytics/summary', () =>
      HttpResponse.json(analytics(currentGeneration)),
    ),
    http.get('http://localhost/api/v1/recommendations', async () => {
      recommendationCalls += 1;
      const responseGeneration = currentGeneration;
      if (recommendationCalls === 2) await oldRequest;
      return HttpResponse.json({
        generation: responseGeneration,
        items: [responseGeneration === generation ? recommendation : otherRecommendation],
        refill: {
          status: recommendationCalls === 1 ? 'REFILLING' : 'READY',
          reason: null,
        },
      });
    }),
    http.delete('http://localhost/api/v1/progress', () => {
      currentGeneration = nextGeneration;
      return HttpResponse.json({ generation: nextGeneration });
    }),
  );
  const user = userEvent.setup();
  render(<App />);
  expect(await screen.findByText(recommendation.title)).toBeVisible();
  await waitFor(() => expect(recommendationCalls).toBeGreaterThanOrEqual(2), { timeout: 3000 });
  await user.click(screen.getByRole('button', { name: 'Reset progress' }));
  await user.type(screen.getByRole('textbox'), 'RESET');
  await user.click(screen.getByRole('button', { name: 'Delete progress' }));
  expect(await screen.findByText(otherRecommendation.title)).toBeVisible();
  releaseOldRequest();
  await waitFor(() => expect(recommendationCalls).toBeGreaterThanOrEqual(3));
  expect(screen.queryByText(recommendation.title)).not.toBeInTheDocument();
});

test('retries a lost completion with one idempotency key and clears only after success', async () => {
  const idempotencyKeys: string[] = [];
  const payloads: unknown[] = [];
  let calls = 0;
  server.use(
    http.post('http://localhost/api/v1/attempts', async ({ request }) => {
      payloads.push(await request.json());
      idempotencyKeys.push(request.headers.get('idempotency-key') ?? '');
      if (++calls === 1)
        return HttpResponse.json(
          { error: { code: 'TEMPORARY', message: 'Temporary failure.' } },
          { status: 503 },
        );
      return HttpResponse.json(
        {
          generation,
          attempt: {
            id: '44444444-4444-4444-8444-444444444444',
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
  await user.click(screen.getByRole('button', { name: 'Start timer' }));
  await user.click(screen.getByRole('button', { name: 'Complete' }));
  await completeFeedback(user);
  await user.click(screen.getByRole('button', { name: 'Save attempt' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Temporary failure.');
  expect(localStorage.getItem('retain-dsa.timer.v1')).not.toBeNull();
  await user.click(screen.getByRole('button', { name: 'Save attempt' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(idempotencyKeys).toHaveLength(2);
  expect(idempotencyKeys[0]).toBeTruthy();
  expect(idempotencyKeys[1]).toBe(idempotencyKeys[0]);
  expect(payloads[1]).toEqual(payloads[0]);
  expect(localStorage.getItem('retain-dsa.timer.v1')).toBeNull();
});

test('a late completion callback does not clear a newer timer identity', async () => {
  let resolveAttempt!: () => void;
  const pending = new Promise<void>((resolve) => (resolveAttempt = resolve));
  server.use(
    http.get('http://localhost/api/v1/recommendations', () =>
      HttpResponse.json({
        generation,
        items: [recommendation, otherRecommendation],
        refill: { status: 'READY', reason: null },
      }),
    ),
    http.post('http://localhost/api/v1/attempts', async () => {
      await pending;
      return HttpResponse.json(
        {
          generation,
          attempt: {
            id: '44444444-4444-4444-8444-444444444444',
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
  expect(await screen.findByText(otherRecommendation.title)).toBeVisible();
  await user.click(screen.getAllByRole('button', { name: 'Start timer' })[0]!);
  await user.click(screen.getAllByRole('button', { name: 'Complete' })[0]!);
  await completeFeedback(user);
  await user.click(screen.getByRole('button', { name: 'Save attempt' }));
  localStorage.setItem(
    'retain-dsa.timer.v1',
    JSON.stringify({
      recommendationId: otherRecommendation.id,
      generation,
      status: 'RUNNING',
      accumulatedSeconds: 0,
      startedAt: Date.now(),
    }),
  );
  act(() =>
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'retain-dsa.timer.v1', storageArea: localStorage }),
    ),
  );
  resolveAttempt();
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(JSON.parse(localStorage.getItem('retain-dsa.timer.v1')!)).toMatchObject({
    recommendationId: otherRecommendation.id,
  });
});
