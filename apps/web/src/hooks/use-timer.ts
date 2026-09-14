import { useCallback, useEffect, useMemo, useState } from 'react';

const storageKey = 'retain-dsa.timer.v1';
export interface TimerState {
  recommendationId: string;
  generation: string;
  status: 'RUNNING' | 'PAUSED';
  startedAt: number | null;
  accumulatedSeconds: number;
}

function readTimer(fallback: TimerState | null = null): TimerState | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as TimerState | null;
    if (
      !value ||
      !value.recommendationId ||
      !value.generation ||
      !['RUNNING', 'PAUSED'].includes(value.status)
    )
      return null;
    if (!Number.isFinite(value.accumulatedSeconds) || value.accumulatedSeconds < 0) return null;
    if (
      value.status === 'RUNNING' &&
      (!Number.isFinite(value.startedAt) ||
        value.startedAt === null ||
        value.startedAt < 0 ||
        value.startedAt > Date.now())
    )
      return null;
    if (value.status === 'PAUSED' && value.startedAt !== null) return null;
    return value;
  } catch {
    return fallback;
  }
}

export function clearTimerStorage(): void {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    /* Storage is advisory. */
  }
}

export function reconcileTimerStorage(generation: string): void {
  const timer = readTimer();
  if (timer && timer.generation !== generation) clearTimerStorage();
}

export function useTimer(generation: string | undefined) {
  const [timer, setTimer] = useState<TimerState | null>(() => readTimer());
  const [, tick] = useState(0);
  const persist = useCallback((next: TimerState | null) => {
    setTimer(next);
    try {
      if (next) localStorage.setItem(storageKey, JSON.stringify(next));
      else localStorage.removeItem(storageKey);
    } catch {
      /* Keep the current tab usable when browser storage is blocked. */
    }
  }, []);
  useEffect(() => {
    if (timer && generation && timer.generation !== generation) persist(null);
  }, [generation, persist, timer]);
  useEffect(() => {
    if (timer?.status !== 'RUNNING') return;
    const id = window.setInterval(() => tick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [timer?.status]);
  useEffect(() => {
    const listener = (event: StorageEvent) => {
      if (event.key === storageKey) setTimer(readTimer());
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }, []);
  const elapsed = useMemo(() => {
    if (!timer) return 0;
    const running =
      timer.status === 'RUNNING' && timer.startedAt
        ? Math.max(0, Math.floor((Date.now() - timer.startedAt) / 1000))
        : 0;
    return timer.accumulatedSeconds + running;
  }, [timer, Date.now() - (Date.now() % 1000)]);
  return {
    timer,
    elapsed,
    start: (recommendationId: string) => {
      if (!generation) return false;
      const latest = readTimer(timer);
      if (
        latest &&
        latest.generation === generation &&
        latest.recommendationId !== recommendationId
      )
        return false;
      persist({
        recommendationId,
        generation,
        status: 'RUNNING',
        startedAt: Date.now(),
        accumulatedSeconds:
          latest?.generation === generation && latest.recommendationId === recommendationId
            ? latest.accumulatedSeconds
            : 0,
      });
      return true;
    },
    pause: () => {
      const latest = readTimer(timer);
      if (
        timer &&
        latest?.recommendationId === timer.recommendationId &&
        latest.generation === timer.generation
      )
        persist({ ...latest, status: 'PAUSED', accumulatedSeconds: elapsed, startedAt: null });
    },
    clear: () => {
      const latest = readTimer(timer);
      if (
        timer &&
        latest?.recommendationId === timer.recommendationId &&
        latest.generation === timer.generation
      )
        persist(null);
    },
    clearMatching: (recommendationId: string, expectedGeneration: string) => {
      const latest = readTimer(timer);
      if (latest?.recommendationId === recommendationId && latest.generation === expectedGeneration)
        persist(null);
    },
  };
}
