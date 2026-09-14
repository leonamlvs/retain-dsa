import { useEffect, useRef, useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ActivityCalendar } from './components/activity-calendar.js';
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
  new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 10_000 } } });
const keys = {
  session: ['session'] as const,
  curriculum: (generation: string) => ['curriculum', generation] as const,
  recommendations: (generation: string) => ['recommendations', generation] as const,
  recommendation: (generation: string, id: string) => ['recommendation', generation, id] as const,
  analytics: (generation: string, timezone: string) => ['analytics', generation, timezone] as const,
};
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
    if (generation)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.curriculum(generation) }),
        queryClient.invalidateQueries({ queryKey: keys.recommendations(generation) }),
        queryClient.invalidateQueries({ queryKey: ['analytics', generation] }),
      ]);
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

function FlameIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M11.7 2.2c.4 2.5-.8 3.5-1.7 4.7-.5-1.1-1.3-1.9-2.3-2.6.1 2.7-2.5 4.4-2.5 7.6 0 2.8 2.1 5.1 4.8 5.1s4.8-2.2 4.8-5.1c0-3.2-1.8-6.6-3.1-9.7Zm-1.6 12.5c-1.2 0-2.1-.9-2.1-2.1 0-1.1.7-2 1.5-2.9.1 1 .6 1.5 1 2 .5-.6.9-1.3.9-2.3.6 1 1 2 1 3.2-.1 1.2-1.1 2.1-2.3 2.1Z" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m4.5 3 7 5-7 5V3Z" />
    </svg>
  );
}
function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M9 2h5v5h-1.5V4.6L7.2 9.9 6.1 8.8l5.3-5.3H9V2Z" />
      <path d="M12.5 9.5V14h-10V4h4.4v1.5H4V12.5h7V9.5h1.5Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m5.2 4.1 4.8 4.8 4.8-4.8 1.1 1.1-4.8 4.8 4.8 4.8-1.1 1.1-4.8-4.8-4.8 4.8-1.1-1.1L8.9 10 4.1 5.2l1.1-1.1Z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 448 512" aria-hidden="true">
      <path d="M416 32H31.9C14.3 32 0 46.5 0 64.3v383.4C0 465.5 14.3 480 31.9 480H416c17.6 0 32-14.5 32-32.3V64.3C448 46.5 433.6 32 416 32ZM135.4 416H69V202.2h66.5V416Zm-33.2-243c-21.3 0-38.5-17.3-38.5-38.5S80.9 96 102.2 96s38.5 17.3 38.5 38.5c0 21.3-17.2 38.5-38.5 38.5ZM384.3 416h-66.4V312c0-24.8-.5-56.7-34.5-56.7-34.6 0-39.9 27-39.9 54.9V416h-66.4V202.2h63.7v29.2h.9c8.9-16.8 30.6-34.5 62.9-34.5 67.2 0 79.7 44.3 79.7 101.9V416Z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 .3A12 12 0 0 0 8.2 23.68c.6.11.82-.26.82-.58v-2.24c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.09-.73.09-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.1-.78.42-1.3.76-1.6-2.67-.31-5.47-1.34-5.47-5.93 0-1.31.47-2.38 1.23-3.22-.12-.3-.53-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.46 11.46 0 0 1 6 0c2.29-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.13 3.18a4.65 4.65 0 0 1 1.23 3.22c0 4.61-2.81 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .3Z" />
    </svg>
  );
}

function Header({ streak }: { streak: number | null }) {
  return (
    <header className="site-header">
      <NavLink className="brand" to="/challenges">
        <span className="logo-mark" aria-hidden="true" />
        <span className="brand-name">Retain DSA</span>
      </NavLink>
      <nav aria-label="Main navigation">
        <NavLink to="/challenges">Challenges</NavLink>
        <NavLink to="/analytics">Analytics</NavLink>
      </nav>
      <div
        className="streak"
        aria-label={
          streak === null ? 'Current streak unavailable' : `Current streak: ${streak} days`
        }
      >
        <FlameIcon />
        <strong>{streak ?? '—'}</strong>
        <small>days</small>
      </div>
    </header>
  );
}

function Progress({ value }: { value: number | null | undefined }) {
  return (
    <section className="progress-summary" aria-labelledby="progress-title">
      <div>
        <h2 id="progress-title">LeetCode 75</h2>
        <p>{value == null ? 'Curriculum coverage unavailable' : 'Curriculum completed'}</p>
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

function PageLead({ title, description }: { title: string; description: string }) {
  return (
    <div className="page-lead">
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

function StudyOverview({
  data,
  route,
}: {
  data: ReturnType<typeof useStudyData>;
  route: 'challenges' | 'analytics';
}) {
  const analyticsState =
    data.reconciling || data.analytics.isLoading
      ? 'loading'
      : data.analytics.error || data.connectionError
        ? 'error'
        : 'ready';
  return (
    <section className="overview">
      <PageLead
        title={
          route === 'challenges' ? 'Choose what to practice next.' : 'Your practice, over time.'
        }
        description={
          route === 'challenges'
            ? `Make steady progress through LeetCode 75. You've completed ${data.curriculum.data?.progressPercentage ?? '—'}% of the curriculum.`
            : 'Read the record of completed attempts without turning practice into a score.'
        }
      />
      <ActivityCalendar
        entries={data.analytics.data?.heatmap ?? []}
        state={analyticsState}
        onRetry={() => void data.recover()}
      />
      <Progress value={data.curriculum.data?.progressPercentage} />
    </section>
  );
}

type FeedbackAnswers = Parameters<typeof saveAttempt>[0]['answers'];
type FeedbackDraft = { [Key in keyof FeedbackAnswers]: FeedbackAnswers[Key] | '' };
const blankFeedback: FeedbackDraft = {
  independence: '',
  recognition: '',
  implementation: '',
  complexity: '',
};
const feedbackFields: {
  key: keyof FeedbackAnswers;
  label: string;
  hint: string;
  options: [string, string][];
}[] = [
  {
    key: 'independence',
    label: 'Independence',
    hint: 'How much outside help did you need?',
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
    hint: 'When did the core pattern become clear?',
    options: [
      ['INDEPENDENT', 'Recognized it independently'],
      ['AFTER_HELP', 'Recognized it with help'],
      ['NOT_RECOGNIZED', 'Did not recognize it'],
    ],
  },
  {
    key: 'implementation',
    label: 'Implementation',
    hint: 'How smoothly did the code come together?',
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
    hint: 'How confident were you in the analysis?',
    options: [
      ['CORRECT', 'Analyzed it correctly'],
      ['PARTIAL', 'Partial analysis'],
      ['UNABLE', 'Could not analyze it'],
    ],
  },
];

function parseDuration(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const parts = trimmed.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d{1,2}$/.test(part)))
    return undefined;
  const values = parts.map(Number);
  if (values.slice(1).some((part) => part > 59)) return undefined;
  return parts.length === 2
    ? values[0]! * 60 + values[1]!
    : values[0]! * 3600 + values[1]! * 60 + values[2]!;
}

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
  const [answers, setAnswers] = useState<FeedbackDraft>(blankFeedback);
  const [duration, setDuration] = useState(
    suggestedDuration === null ? '' : formatTimer(suggestedDuration),
  );
  const modalRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const submitted = useRef<Parameters<typeof saveAttempt>[0] | null>(null);
  const complete = Object.values(answers).every(Boolean);
  const parsedDuration = parseDuration(duration);
  const validDuration = parsedDuration !== undefined;
  const mutation = useMutation({
    mutationFn: () => {
      if (!complete || parsedDuration === undefined)
        throw new Error('Complete each reflection before saving.');
      submitted.current ??= {
        recommendationId: recommendation.id,
        generation,
        idempotencyKey,
        answers: answers as FeedbackAnswers,
        durationSeconds: parsedDuration,
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
      if (event.key !== 'Tab' || !modalRef.current) return;
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
          <CloseIcon />
        </button>
        <h2 id="feedback-title">How did {recommendation.title} go?</h2>
        <p className="modal-intro">
          Choose each answer deliberately. These reflections shape future recommendations.
        </p>
        <div className="feedback-grid">
          {feedbackFields.map((field) => (
            <label key={field.key}>
              <span>{field.label}</span>
              <small>{field.hint}</small>
              <select
                disabled={mutation.isPending || submitted.current !== null}
                value={answers[field.key]}
                onChange={(event) =>
                  setAnswers({
                    ...answers,
                    [field.key]: event.target.value as FeedbackDraft[typeof field.key],
                  })
                }
                required
              >
                <option value="" disabled>
                  Choose an answer
                </option>
                {field.options.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <label className="duration-field">
          <span>
            Duration <small>optional</small>
          </span>
          <input
            inputMode="numeric"
            disabled={mutation.isPending || submitted.current !== null}
            value={duration}
            placeholder="mm:ss or hh:mm:ss"
            onChange={(event) => setDuration(event.target.value)}
            aria-describedby="duration-help"
            aria-invalid={!validDuration}
          />
          <small id="duration-help">Use 18:30 for eighteen minutes and thirty seconds.</small>
        </label>
        {!validDuration && (
          <p className="error" role="alert">
            Enter duration as mm:ss, hh:mm:ss, or total seconds.
          </p>
        )}
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
            disabled={!complete || !validDuration || mutation.isPending}
            aria-busy={mutation.isPending}
          >
            {mutation.isPending ? 'Saving…' : 'Save attempt'}
          </button>
        </div>
      </section>
    </div>
  );
}

const reasonLabel: Record<Recommendation['reason'], string> = {
  PROGRESSION: 'Builds curriculum coverage',
  REVIEW: 'Due for memory review',
  REVALIDATION: 'Revalidates prior recall',
};

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
  const tags = item.tags
    .filter(
      (tag) => tag.toLowerCase().replaceAll('-', ' ') !== item.primarySkill.name.toLowerCase(),
    )
    .slice(0, 2);
  return (
    <article className={`challenge-row${ownsTimer ? ' timer-owned' : ''}`}>
      <div className="problem-identity">
        <span className="challenge-number">#{item.frontendId}</span>
        <div>
          <h3>{item.title}</h3>
          <p>{reasonLabel[item.reason]}</p>
        </div>
      </div>
      <span className={`difficulty ${item.difficulty.toLowerCase()}`}>{item.difficulty}</span>
      <span className="primary-skill">{item.primarySkill.name}</span>
      <div className="tag-list">
        {tags.map((tag) => (
          <span key={tag}>{tag.replaceAll('-', ' ')}</span>
        ))}
      </div>
      <div className="challenge-actions">
        <a className="button ghost" href={item.url} target="_blank" rel="noreferrer">
          View <ExternalIcon />
        </a>
        {ownsTimer ? (
          <div className="timer-control">
            <span className="timer">
              <i />
              {formatTimer(timer.elapsed)}
            </span>
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
          </div>
        ) : (
          <button
            className="icon-button"
            disabled={anotherTimer}
            title={anotherTimer ? 'Clear the current timer first' : undefined}
            onClick={() => timer.start(item.id)}
          >
            <PlayIcon />
            Start timer
          </button>
        )}
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
    cache.removeQueries({ predicate: (query) => query.queryKey[0] !== keys.session[0] });
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
        /* Preserve reset failure and local user state. */
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

function queueStatus(data: ReturnType<typeof useStudyData>) {
  if (data.recommendations.data?.refill.status === 'REFILLING')
    return ['refilling', 'Finding options'];
  if (data.recommendations.data?.refill.status === 'SHORTAGE')
    return ['shortage', 'Limited catalog'];
  if (data.recommendations.error || data.connectionError)
    return ['shortage', 'Connection interrupted'];
  if (data.recommendations.isSuccess && data.recommendations.data.items.length > 0)
    return ['', 'Queue ready'];
  if (data.recommendations.isSuccess) return ['shortage', 'No eligible challenges'];
  return ['refilling', 'Connecting'];
}

function QueueSkeletonRow({ position }: { position: number }) {
  return (
    <div className="challenge-row skeleton-row" aria-hidden="true" data-position={position}>
      <div className="problem-identity">
        <span className="skeleton-block skeleton-number" />
        <div>
          <span className="skeleton-block skeleton-title" />
          <span className="skeleton-block skeleton-reason" />
        </div>
      </div>
      <span className="skeleton-block skeleton-difficulty" />
      <span className="skeleton-block skeleton-skill" />
      <div className="skeleton-tags">
        <span className="skeleton-block" />
        <span className="skeleton-block" />
      </div>
      <div className="skeleton-actions">
        <span className="skeleton-block" />
        <span className="skeleton-block" />
      </div>
    </div>
  );
}

function ChallengesPage({ data }: { data: ReturnType<typeof useStudyData> }) {
  const timer = useTimer(data.generation);
  const [selected, setSelected] = useState<Recommendation | null>(null);
  const [notice, setNotice] = useState('');
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
    setNotice('Attempt saved. Your history and recommendation queue are up to date.');
    if (!data.generation) return;
    await Promise.all([
      cache.invalidateQueries({ queryKey: keys.curriculum(data.generation) }),
      cache.invalidateQueries({ queryKey: keys.recommendations(data.generation) }),
      cache.invalidateQueries({ queryKey: ['analytics', data.generation] }),
    ]);
  };
  const [statusClass, statusText] = queueStatus(data);
  const queueItems = data.recommendations.data?.items ?? [];
  const queueIsEmpty = queueItems.length === 0;
  const queueIsRefilling = data.recommendations.data?.refill.status === 'REFILLING';
  const targetSize = data.recommendations.data?.refill.targetSize ?? 5;
  const showQueuePlaceholders =
    !data.reconciling &&
    !data.connectionError &&
    !data.recommendations.error &&
    (data.recommendations.isLoading || queueIsRefilling);
  const placeholderCount = showQueuePlaceholders ? Math.max(0, targetSize - queueItems.length) : 0;
  return (
    <>
      <StudyOverview data={data} route="challenges" />
      <section className="queue-section" aria-labelledby="queue-title">
        <div className="section-heading">
          <div>
            <h2 id="queue-title">Next recommended problems</h2>
          </div>
          <span className={`status ${statusClass}`}>
            <i />
            {statusText}
          </span>
        </div>
        {notice && (
          <p className="success-notice" role="status">
            {notice}
          </p>
        )}
        <div className="queue-columns" aria-hidden="true">
          <span>Problem</span>
          <span>Difficulty</span>
          <span>Primary skill</span>
          <span>Tags</span>
          <span>Actions</span>
        </div>
        {(data.recommendations.error || data.connectionError) && !data.reconciling && (
          <div className="empty error">
            <p>
              {(data.connectionError ?? data.recommendations.error)?.message ??
                'Unable to load local recommendations.'}
            </p>
            <button className="button" onClick={() => void data.recover()}>
              Retry connection
            </button>
          </div>
        )}
        {data.reconciling && (
          <div className="empty" role="status">
            Refreshing local data…
          </div>
        )}
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
        {!data.reconciling &&
          placeholderCount === 0 &&
          data.recommendations.isSuccess &&
          queueIsEmpty && (
            <div className="empty">
              <h3>No eligible challenges right now</h3>
              <p>
                {data.recommendations.data?.refill.reason ??
                  'There is no valid free candidate for the current practice needs.'}
              </p>
            </div>
          )}
        <div className="challenge-list" aria-busy={placeholderCount > 0 || undefined}>
          {placeholderCount > 0 && (
            <span className="sr-only" role="status" aria-live="polite">
              Preparing {placeholderCount} more{' '}
              {placeholderCount === 1 ? 'recommendation' : 'recommendations'}…
            </span>
          )}
          {queueItems.map((item) => (
            <ChallengeCard
              key={item.id}
              item={item}
              generation={data.generation!}
              timer={timer}
              onComplete={setSelected}
            />
          ))}
          {Array.from({ length: placeholderCount }, (_, index) => {
            const position = queueItems.length + index;
            return <QueueSkeletonRow key={`queue-placeholder-${position}`} position={position} />;
          })}
          {recovered.data?.recordable && (
            <div className="recovered">
              <p>In-progress attempt recovered from the original issuance.</p>
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
const analyticsLabels: Record<string, string> = {
  INDEPENDENT: 'Independent',
  ONE_HINT: 'One hint',
  SUBSTANTIAL_HELP: 'Substantial help',
  FULL_SOLUTION: 'Viewed solution',
  FAILED: 'Did not complete',
  AFTER_HELP: 'After help',
  NOT_RECOGNIZED: 'Not recognized',
  SMOOTH: 'Smooth',
  MINOR_DIFFICULTY: 'Minor difficulty',
  MAJOR_DIFFICULTY: 'Major difficulty',
  UNABLE: 'Unable',
  CORRECT: 'Correct',
  PARTIAL: 'Partial',
  Easy: 'Easy',
  Medium: 'Medium',
  Hard: 'Hard',
};

function Distribution({
  title,
  values,
}: {
  title: string;
  values: { key: string; count: number }[] | undefined;
}) {
  const max = Math.max(1, ...(values ?? []).map((item) => item.count));
  return (
    <section className="distribution">
      <h3>{title}</h3>
      {values?.length ? (
        values.map((item) => (
          <div className="bar-row" key={item.key}>
            <span>
              {analyticsLabels[item.key] ??
                item.key
                  .replaceAll('_', ' ')
                  .toLowerCase()
                  .replace(/^./, (character) => character.toUpperCase())}
            </span>
            <div aria-hidden="true">
              <i style={{ width: `${(item.count / max) * 100}%` }} />
            </div>
            <strong aria-label={`${item.count} attempts`}>{item.count}</strong>
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
      <>
        <PageLead
          title="Your practice, over time."
          description="The analytics record is temporarily unavailable."
        />
        <section className="page-state">
          <p role="alert">Unable to load analytics.</p>
          <button className="button" onClick={() => void data.recover()}>
            Retry connection
          </button>
        </section>
      </>
    );
  if (!value || data.reconciling)
    return (
      <>
        <PageLead
          title="Your practice, over time."
          description="Loading your local practice record."
        />
        <section className="page-state" role="status">
          Loading analytics…
        </section>
      </>
    );
  return (
    <>
      <StudyOverview data={data} route="analytics" />
      <section className="analytics-section" aria-labelledby="history-title">
        <div className="section-heading">
          <div>
            <h2 id="history-title">History at a glance</h2>
          </div>
        </div>
        <div className="metrics">
          <Metric label="Unique challenges" value={value.uniqueProblems} />
          <Metric label="Attempts" value={value.totalAttempts} />
          <Metric label="Current streak" value={`${value.currentStreak} days`} />
          <Metric label="Longest streak" value={`${value.longestStreak} days`} />
          <Metric
            label="Median duration"
            value={
              value.medianDurationSeconds == null
                ? '—'
                : formatTimer(Math.round(value.medianDurationSeconds))
            }
          />
        </div>
        <div className="analytics-layout">
          <section className="evolution-panel">
            <div>
              <h3>Attempt evolution</h3>
            </div>
            {value.evolution.length ? (
              <div className="table-scroll">
                <table>
                  <caption className="sr-only">Attempts by local completion date</caption>
                  <thead>
                    <tr>
                      <th scope="col">Local date</th>
                      <th scope="col">Attempts</th>
                      <th scope="col">Cumulative</th>
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
              </div>
            ) : (
              <p className="muted">No attempts recorded yet.</p>
            )}
          </section>
          <div className="distribution-grid">
            <Distribution title="Primary skill" values={value.bySkill} />
            <Distribution title="Difficulty" values={value.byDifficulty} />
            <Distribution title="Independence" values={value.feedback.independence} />
            <Distribution title="Pattern recognition" values={value.feedback.recognition} />
            <Distribution title="Implementation" values={value.feedback.implementation} />
            <Distribution title="Big-O" values={value.feedback.complexity} />
          </div>
        </div>
      </section>
      <ResetControl generation={data.generation} />
    </>
  );
}

function Shell() {
  const data = useStudyData();
  const streak =
    data.analytics.error || data.connectionError
      ? null
      : (data.analytics.data?.currentStreak ?? null);
  return (
    <div className="app-shell">
      <Header streak={streak} />
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
            <LinkedInIcon />
          </a>
          <a href="https://github.com/leonamlvs" target="_blank" rel="noreferrer">
            GitHub
            <GitHubIcon />
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
      /* Storage is optional. */
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
