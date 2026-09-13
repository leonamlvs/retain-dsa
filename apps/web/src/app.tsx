import { useEffect, useRef, useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import {
  getAnalytics,
  getCurriculum,
  getRecommendation,
  getRecommendations,
  getSession,
  resetProgress,
  saveAttempt,
  type Recommendation,
} from './services/api.js';
import { clearTimerStorage, reconcileTimerStorage, useTimer } from './hooks/use-timer.js';

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
  });
const keys = {
  session: ['session'] as const,
  curriculum: (generation: string) => ['curriculum', generation] as const,
  recommendations: (generation: string) => ['recommendations', generation] as const,
  recommendation: (generation: string, id: string) => ['recommendation', generation, id] as const,
  analytics: (generation: string, timezone: string) => ['analytics', generation, timezone] as const,
} as const;
const formatTimer = (seconds: number) =>
  [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
function useStudyData() {
  const queryClient = useQueryClient();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const session = useQuery({
    queryKey: keys.session,
    queryFn: ({ signal }) => getSession(signal),
    retry: 1,
    staleTime: Infinity,
    refetchOnWindowFocus: 'always',
  });
  const generation = session.data?.generation;
  useEffect(() => {
    const refreshSession = () => void queryClient.invalidateQueries({ queryKey: keys.session });
    window.addEventListener('focus', refreshSession);
    return () => window.removeEventListener('focus', refreshSession);
  }, [queryClient]);
  useEffect(() => {
    if (generation) reconcileTimerStorage(generation);
  }, [generation]);
  const curriculum = useQuery({
    queryKey: keys.curriculum(generation ?? ''),
    queryFn: ({ signal }) => getCurriculum(signal),
    enabled: Boolean(generation),
    retry: false,
  });
  const recommendations = useQuery({
    queryKey: keys.recommendations(generation ?? ''),
    queryFn: ({ signal }) => getRecommendations(signal),
    enabled: Boolean(generation),
    retry: false,
    refetchInterval: (query) =>
      !query.state.error && query.state.data?.refill.status === 'REFILLING' ? 1500 : false,
  });
  const analytics = useQuery({
    queryKey: keys.analytics(generation ?? '', timezone),
    queryFn: ({ signal }) => getAnalytics(timezone, signal),
    enabled: Boolean(generation),
    retry: false,
  });
  const recover = async () => {
    await queryClient.cancelQueries();
    await queryClient.invalidateQueries({ queryKey: keys.session });
    if (generation) {
      await queryClient.invalidateQueries({ queryKey: keys.curriculum(generation) });
      await queryClient.invalidateQueries({ queryKey: keys.recommendations(generation) });
      await queryClient.invalidateQueries({ queryKey: ['analytics', generation] });
    }
  };
  return {
    curriculum,
    recommendations,
    analytics,
    generation,
    reconciling: session.isPending,
    connectionError: session.error,
    recover,
  };
}

function Header({ streak }: { streak: number }) {
  return (
    <header className="site-header">
      <NavLink className="brand" to="/challenges">
        <span className="logo-mark">R</span>
        <h1>Retain DSA</h1>
      </NavLink>
      <nav aria-label="Main navigation">
        <NavLink to="/challenges">Challenges</NavLink>
        <NavLink to="/analytics">Analytics</NavLink>
      </nav>
      <div className="streak">
        <span>🔥</span>
        <strong>{streak}</strong>
        <small>days</small>
      </div>
    </header>
  );
}

function Progress({ value }: { value: number | null | undefined }) {
  return (
    <section className="progress-card">
      <div>
        <span className="eyebrow">Official curriculum</span>
        <h2>LeetCode 75</h2>
      </div>
      <strong>{value == null ? '—' : `${value}%`}</strong>
      <div
        className="progress-track"
        aria-label={value == null ? 'Progress unavailable' : `${value}% complete`}
      >
        <span style={{ width: `${value ?? 0}%` }} />
      </div>
    </section>
  );
}

function Heatmap({ entries = [] }: { entries: { date: string; count: number }[] | undefined }) {
  const map = new Map(entries.map((entry) => [entry.date, entry.count]));
  const localToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const days = Array.from({ length: 84 }, (_, offset) => {
    const date = new Date(`${localToday}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 83 + offset);
    return date.toISOString().slice(0, 10);
  });
  return (
    <section className="heatmap-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Consistency</span>
          <h2>Recent activity</h2>
        </div>
        <span className="muted">Last 12 weeks</span>
      </div>
      <div className="heatmap" aria-label="Activity calendar">
        {days.map((date) => {
          const count = map.get(date) ?? 0;
          return (
            <span
              key={date}
              className={`heat level-${Math.min(count, 4)}`}
              tabIndex={0}
              role="img"
              aria-label={`${date}: ${count} attempt${count === 1 ? '' : 's'}`}
              title={`${date}: ${count} attempt${count === 1 ? '' : 's'}`}
            />
          );
        })}
      </div>
    </section>
  );
}

function Overview({ data }: { data: ReturnType<typeof useStudyData> }) {
  return (
    <div className="overview">
      <Progress value={data.curriculum.data?.progressPercentage} />
      <Heatmap entries={data.analytics.data?.heatmap} />
    </div>
  );
}

type FeedbackAnswers = Parameters<typeof saveAttempt>[0]['answers'];
const defaults: FeedbackAnswers = {
  independence: 'INDEPENDENT',
  recognition: 'INDEPENDENT',
  implementation: 'SMOOTH',
  complexity: 'CORRECT',
};
const feedbackFields: { key: keyof FeedbackAnswers; label: string; options: [string, string][] }[] =
  [
    {
      key: 'independence',
      label: 'Independence',
      options: [
        ['INDEPENDENT', 'Solved independently'],
        ['ONE_HINT', 'One hint'],
        ['SUBSTANTIAL_HELP', 'Substantial help'],
        ['FULL_SOLUTION', 'Viewed the solution'],
        ['FAILED', 'Did not complete'],
      ],
    },
    {
      key: 'recognition',
      label: 'Pattern recognition',
      options: [
        ['INDEPENDENT', 'Recognized it independently'],
        ['AFTER_HELP', 'Recognized it with help'],
        ['NOT_RECOGNIZED', 'Did not recognize it'],
      ],
    },
    {
      key: 'implementation',
      label: 'Implementation',
      options: [
        ['SMOOTH', 'Smooth'],
        ['MINOR_DIFFICULTY', 'Minor difficulties'],
        ['MAJOR_DIFFICULTY', 'Major difficulties'],
        ['UNABLE', 'Could not implement it'],
      ],
    },
    {
      key: 'complexity',
      label: 'Big-O complexity',
      options: [
        ['CORRECT', 'Analyzed it correctly'],
        ['PARTIAL', 'Partial analysis'],
        ['UNABLE', 'Could not analyze it'],
      ],
    },
  ];

function FeedbackModal({
  recommendation,
  generation,
  suggestedDuration,
  onClose,
  onSaved,
}: {
  recommendation: Recommendation;
  generation: string;
  suggestedDuration: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [answers, setAnswers] = useState(defaults);
  const [duration, setDuration] = useState(
    suggestedDuration === null ? '' : String(suggestedDuration),
  );
  const modalRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const submitted = useRef<Parameters<typeof saveAttempt>[0] | null>(null);
  const mutation = useMutation({
    mutationFn: () => {
      submitted.current ??= {
        recommendationId: recommendation.id,
        generation,
        idempotencyKey,
        answers,
        durationSeconds: duration === '' ? null : Number(duration),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      return saveAttempt(submitted.current);
    },
    onSuccess: onSaved,
  });
  useEffect(() => {
    modalRef.current?.focus();
    return () => returnFocusRef.current?.focus();
  }, []);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !mutation.isPending) onClose();
      if (event.key === 'Tab' && modalRef.current) {
        const controls = [
          ...modalRef.current.querySelectorAll<HTMLElement>(
            'button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex="0"]',
          ),
        ];
        const first = controls[0];
        const last = controls.at(-1);
        if (!first || !last) {
          event.preventDefault();
          modalRef.current.focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === modalRef.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || document.activeElement === modalRef.current)
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [mutation.isPending, onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !mutation.isPending) onClose();
      }}
    >
      <section
        ref={modalRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        tabIndex={-1}
      >
        <button
          className="modal-close"
          aria-label="Close"
          onClick={onClose}
          disabled={mutation.isPending}
        >
          ×
        </button>
        <span className="eyebrow">Record attempt</span>
        <h2 id="feedback-title">How did {recommendation.title} go?</h2>
        <div className="feedback-grid">
          {feedbackFields.map((field) => (
            <label key={field.key}>
              {field.label}
              <select
                disabled={mutation.isPending || submitted.current !== null}
                value={answers[field.key]}
                onChange={(event) => setAnswers({ ...answers, [field.key]: event.target.value })}
              >
                {field.options.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <label>
          Duration in seconds{' '}
          <input
            min="0"
            type="number"
            disabled={mutation.isPending || submitted.current !== null}
            value={duration}
            placeholder="Optional"
            onChange={(event) => setDuration(event.target.value)}
          />
        </label>
        {mutation.error && (
          <p className="error" role="alert">
            {mutation.error.message} Retry sends the same recorded answers and duration.
          </p>
        )}
        <div className="modal-actions">
          <button className="button ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            aria-busy={mutation.isPending}
          >
            {mutation.isPending ? 'Saving…' : 'Save attempt'}
          </button>
        </div>
      </section>
    </div>
  );
}

function ChallengeCard({
  item,
  generation,
  timer,
  onComplete,
}: {
  item: Recommendation;
  generation: string;
  timer: ReturnType<typeof useTimer>;
  onComplete: (item: Recommendation) => void;
}) {
  const ownsTimer =
    timer.timer?.recommendationId === item.id && timer.timer.generation === generation;
  const anotherTimer = Boolean(timer.timer && !ownsTimer);
  return (
    <article className="challenge-card">
      <div className="challenge-number">#{item.frontendId}</div>
      <div className="challenge-copy">
        <div className="badges">
          <span className={`difficulty ${item.difficulty.toLowerCase()}`}>{item.difficulty}</span>
          <span>{item.primarySkill.name}</span>
          {item.tags.slice(0, 2).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <h3>{item.title}</h3>
        <p>
          {item.reason === 'PROGRESSION'
            ? 'Curriculum progress'
            : item.reason === 'REVIEW'
              ? 'Memory review'
              : 'Revalidation'}
        </p>
        {ownsTimer && <strong className="timer">{formatTimer(timer.elapsed)}</strong>}
      </div>
      <div className="challenge-actions">
        {ownsTimer ? (
          <>
            <button
              className="icon-button"
              onClick={() =>
                timer.timer?.status === 'RUNNING' ? timer.pause() : timer.start(item.id)
              }
            >
              {timer.timer?.status === 'RUNNING' ? 'Pause' : 'Resume'}
            </button>
            <button className="icon-button" onClick={timer.clear}>
              Clear
            </button>
          </>
        ) : (
          <button
            className="icon-button"
            disabled={anotherTimer}
            title={anotherTimer ? 'Clear the current timer first' : undefined}
            onClick={() => timer.start(item.id)}
          >
            Start
          </button>
        )}
        <a className="button ghost" href={item.url} target="_blank" rel="noreferrer">
          View ↗
        </a>
        <button className="button primary" onClick={() => onComplete(item)}>
          Complete
        </button>
      </div>
    </article>
  );
}

function ResetControl({ generation }: { generation: string | undefined }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const cache = useQueryClient();
  const adoptGeneration = async (nextGeneration: string) => {
    await cache.cancelQueries();
    cache.removeQueries({
      predicate: (query) => query.queryKey[0] !== keys.session[0],
    });
    clearTimerStorage();
    cache.setQueryData(keys.session, { generation: nextGeneration });
    setOpen(false);
    setValue('');
  };
  const mutation = useMutation({
    mutationFn: () => resetProgress(generation!),
    onMutate: async () => {
      await cache.cancelQueries();
    },
    onSuccess: async (result) => {
      await adoptGeneration(result.generation);
    },
    onError: async () => {
      await cache.invalidateQueries({ queryKey: keys.session, refetchType: 'none' });
      try {
        const current = await cache.fetchQuery({
          queryKey: keys.session,
          queryFn: ({ signal }) => getSession(signal),
          staleTime: 0,
        });
        if (generation && current.generation !== generation)
          await adoptGeneration(current.generation);
      } catch {
        /* Preserve the original reset failure and all local user state. */
      }
    },
  });
  return (
    <section className="reset-block">
      <div>
        <h2>Start over</h2>
        <p>Removes attempts, memory, and local recommendations.</p>
      </div>
      {open ? (
        <div className="reset-confirm">
          <label>
            Type <strong>RESET</strong>
            <input value={value} onChange={(event) => setValue(event.target.value)} />
          </label>
          <button
            className="button danger"
            disabled={value !== 'RESET' || !generation || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Delete progress
          </button>
          <button className="button ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button
          className="button danger-outline"
          disabled={!generation}
          onClick={() => setOpen(true)}
        >
          Reset progress
        </button>
      )}
      {mutation.error && <p className="error">{mutation.error.message}</p>}
    </section>
  );
}

function ChallengesPage({ data }: { data: ReturnType<typeof useStudyData> }) {
  const timer = useTimer(data.generation);
  const [selected, setSelected] = useState<Recommendation | null>(null);
  const cache = useQueryClient();
  const timerIsActive = Boolean(timer.timer && timer.timer.generation === data.generation);
  const timerIsInQueue = Boolean(
    timer.timer &&
    data.recommendations.data?.items.some((item) => item.id === timer.timer?.recommendationId),
  );
  const recovered = useQuery({
    queryKey: keys.recommendation(data.generation ?? '', timer.timer?.recommendationId ?? ''),
    queryFn: ({ signal }) => getRecommendation(timer.timer!.recommendationId, signal),
    enabled: timerIsActive && data.recommendations.isSuccess && !timerIsInQueue,
    retry: false,
  });
  const saved = async () => {
    if (selected && data.generation) timer.clearMatching(selected.id, data.generation);
    setSelected(null);
    if (!data.generation) return;
    await Promise.all([
      cache.invalidateQueries({ queryKey: keys.curriculum(data.generation) }),
      cache.invalidateQueries({ queryKey: keys.recommendations(data.generation) }),
      cache.invalidateQueries({ queryKey: ['analytics', data.generation] }),
    ]);
  };
  return (
    <>
      <Overview data={data} />
      <section className="content-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Next steps</span>
            <h2>Recommended Challenges</h2>
          </div>
          <span
            className={`status ${data.recommendations.data?.refill.status.toLowerCase() ?? ''}`}
          >
            {data.recommendations.data?.refill.status === 'REFILLING'
              ? 'Looking for options'
              : data.recommendations.data?.refill.status === 'SHORTAGE'
                ? 'Limited catalog'
                : data.recommendations.error || data.connectionError
                  ? 'Connection interrupted'
                  : data.recommendations.isSuccess && data.recommendations.data.items.length > 0
                    ? 'Queue updated'
                    : data.recommendations.isSuccess
                      ? 'No eligible challenges'
                      : 'Connecting…'}
          </span>
        </div>
        {data.recommendations.isLoading && <div className="empty">Preparing your queue…</div>}
        {(data.recommendations.error || data.connectionError) && !data.reconciling ? (
          <div className="empty error">
            {(data.connectionError ?? data.recommendations.error)?.message ??
              'Unable to load local recommendations.'}
            <button className="button" onClick={() => void data.recover()}>
              Retry connection
            </button>
          </div>
        ) : null}
        {data.reconciling && <div className="empty">Refreshing local data…</div>}
        {data.recommendations.data?.refill.status === 'SHORTAGE' &&
          data.recommendations.data.items.length > 0 && (
            <p role="status">
              {data.recommendations.data.refill.reason ??
                'There are fewer eligible challenges than the queue target.'}
            </p>
          )}
        {recovered.error && (
          <p role="alert">
            Unable to recover your timed attempt.{' '}
            <button onClick={() => void recovered.refetch()}>Retry timed attempt</button>
          </p>
        )}
        {!data.reconciling && data.recommendations.data?.items.length === 0 && (
          <div className="empty">
            <h3>No eligible challenges right now</h3>
            <p>
              {data.recommendations.data?.refill.reason ??
                'The curriculum is syncing, or there is no valid free candidate.'}
            </p>
          </div>
        )}
        <div className="challenge-list">
          {data.recommendations.data?.items.map((item) => (
            <ChallengeCard
              key={item.id}
              item={item}
              generation={data.generation!}
              timer={timer}
              onComplete={setSelected}
            />
          ))}
          {recovered.data?.recordable && (
            <div>
              <p className="muted">In-progress attempt recovered from the original issuance.</p>
              <ChallengeCard
                item={recovered.data}
                generation={data.generation!}
                timer={timer}
                onComplete={setSelected}
              />
            </div>
          )}
        </div>
      </section>
      <ResetControl generation={data.generation} />
      {selected && data.generation && (
        <FeedbackModal
          recommendation={selected}
          generation={data.generation}
          suggestedDuration={timer.timer?.recommendationId === selected.id ? timer.elapsed : null}
          onClose={() => setSelected(null)}
          onSaved={() => void saved()}
        />
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
function Distribution({
  title,
  values,
}: {
  title: string;
  values: { key: string; count: number }[] | undefined;
}) {
  const max = Math.max(1, ...(values ?? []).map((item) => item.count));
  return (
    <section className="chart-card">
      <h3>{title}</h3>
      {values?.length ? (
        values.map((item) => (
          <div className="bar-row" key={item.key}>
            <span>{item.key.replaceAll('_', ' ')}</span>
            <div>
              <i style={{ width: `${(item.count / max) * 100}%` }} />
            </div>
            <strong>{item.count}</strong>
          </div>
        ))
      ) : (
        <p className="muted">No data yet.</p>
      )}
    </section>
  );
}
function AnalyticsPage({ data }: { data: ReturnType<typeof useStudyData> }) {
  const value = data.analytics.data;
  if (data.analytics.error || data.connectionError)
    return (
      <section className="content-section">
        <h2>Analytics</h2>
        <p role="alert">Unable to load analytics.</p>
        <button className="button" onClick={() => void data.recover()}>
          Retry connection
        </button>
      </section>
    );
  if (!value || data.reconciling)
    return (
      <section className="content-section">
        <h2>Analytics</h2>
        <p role="status">Loading analytics…</p>
      </section>
    );
  return (
    <>
      <Overview data={data} />
      <section className="content-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Your history</span>
            <h2>Analytics</h2>
          </div>
        </div>
        <div className="metrics">
          <Metric label="Unique challenges" value={value?.uniqueProblems ?? 0} />
          <Metric label="Attempts" value={value?.totalAttempts ?? 0} />
          <Metric label="Current streak" value={`${value?.currentStreak ?? 0} days`} />
          <Metric label="Longest streak" value={`${value?.longestStreak ?? 0} days`} />
          <Metric
            label="Median duration"
            value={
              value?.medianDurationSeconds == null
                ? '—'
                : formatTimer(Math.round(value.medianDurationSeconds))
            }
          />
        </div>
        <div className="charts">
          <section className="chart-card">
            <h3>Attempt evolution</h3>
            {value.evolution.length ? (
              <table>
                <caption>Attempts by local completion date</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Attempts</th>
                    <th scope="col">Cumulative attempts</th>
                  </tr>
                </thead>
                <tbody>
                  {value.evolution.map((point) => (
                    <tr key={point.date}>
                      <th scope="row">{point.date}</th>
                      <td>{point.attempts}</td>
                      <td>{point.cumulative}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">No attempts recorded yet.</p>
            )}
          </section>
          <Distribution title="Primary skill" values={value?.bySkill} />
          <Distribution title="Difficulty" values={value?.byDifficulty} />
          <Distribution title="Independence" values={value?.feedback.independence} />
          <Distribution title="Pattern recognition" values={value?.feedback.recognition} />
          <Distribution title="Implementation" values={value?.feedback.implementation} />
          <Distribution title="Big-O" values={value?.feedback.complexity} />
        </div>
      </section>
      <ResetControl generation={data.generation} />
    </>
  );
}

function Shell() {
  const data = useStudyData();
  return (
    <div className="app-shell">
      <Header streak={data.analytics.data?.currentStreak ?? 0} />
      <main>
        <Routes>
          <Route
            path="/challenges"
            element={<ChallengesPage key={data.generation} data={data} />}
          />
          <Route path="/analytics" element={<AnalyticsPage data={data} />} />
          <Route path="*" element={<Navigate to="/challenges" replace />} />
        </Routes>
      </main>
      <footer>
        <span>Retain DSA · local, continuous study</span>
        <div>
          <a href="https://www.linkedin.com/in/leonamlvs/" target="_blank" rel="noreferrer">
            LinkedIn
          </a>
          <a href="https://github.com/leonamlvs" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}

export function App() {
  const [queryClient] = useState(createQueryClient);
  useEffect(() => {
    try {
      localStorage.removeItem('retain-dsa.state.v1');
    } catch {
      /* Remove the obsolete browser watermark when storage is available. */
    }
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
