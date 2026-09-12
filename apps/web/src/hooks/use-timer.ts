import { useCallback, useEffect, useMemo, useState } from 'react';
import { currentResponseState } from '../services/state-guard.js';

const storageKey = 'retain-dsa.timer.v1';
export interface TimerState {
  recommendationId: string;
  generation: string;
  status: 'RUNNING' | 'PAUSED';
  startedAt: number | null;
  accumulatedSeconds: number;
  databaseId?: string;
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

export function reconcileTimerStorage(state: { databaseId?: string; generation: string }): void {
  const timer = readTimer();
  if (
    timer &&
    (timer.generation !== state.generation ||
      (timer.databaseId && timer.databaseId !== state.databaseId))
  ) {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* Storage is advisory. */
    }
  }
}

export function useTimer(generation: string | undefined) {
  const databaseId = currentResponseState()?.databaseId;
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
    if (
      timer &&
      generation &&
      (timer.generation !== generation ||
        (timer.databaseId && databaseId && timer.databaseId !== databaseId))
    )
      persist(null);
  }, [databaseId, generation, persist, timer]);
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
      const latest = readTimer(timer);
      if (
        !generation ||
        currentResponseState()?.generation !== generation ||
        currentResponseState()?.databaseId !== databaseId ||
        (latest && latest.generation === generation && latest.recommendationId !== recommendationId)
      )
        return false;
      persist({
        recommendationId,
        generation,
        ...(currentResponseState()?.databaseId
          ? { databaseId: currentResponseState()!.databaseId! }
          : {}),
        status: 'RUNNING',
        startedAt: Date.now(),
        accumulatedSeconds: latest?.generation === generation ? latest.accumulatedSeconds : 0,
      });
      return true;
    },
    pause: () =>
      timer &&
      persist({ ...timer, status: 'PAUSED', accumulatedSeconds: elapsed, startedAt: null }),
    reset: () =>
      timer && persist({ ...timer, status: 'PAUSED', accumulatedSeconds: 0, startedAt: null }),
    clearMatching: (recommendationId: string, expectedGeneration: string) => {
      const latest = readTimer(timer);
      if (
        latest?.recommendationId === recommendationId &&
        latest.generation === expectedGeneration &&
        (!latest.databaseId || latest.databaseId === databaseId) &&
        currentResponseState()?.databaseId === databaseId &&
        currentResponseState()?.generation === expectedGeneration
      )
        persist(null);
    },
  };
}
