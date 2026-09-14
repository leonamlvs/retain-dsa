import { useEffect, useMemo, useRef, useState } from 'react';

type Entry = { date: string; count: number };
type CalendarState = 'loading' | 'ready' | 'error';

const DAY = 86_400_000;
const monthFormatter = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' });
const dateFormatter = new Intl.DateTimeFormat('en', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

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

function shiftDate(date: string, amount: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function readableAttempt(date: string, count: number) {
  return `${dateFormatter.format(new Date(`${date}T00:00:00Z`))}: ${count} attempt${count === 1 ? '' : 's'}`;
}

export function ActivityCalendar({
  entries = [],
  state,
  onRetry,
}: {
  entries?: Entry[];
  state: CalendarState;
  onRetry?: () => void;
}) {
  const today = useMemo(localIsoDate, []);
  const rangeStart = useMemo(() => shiftDate(today, -364), [today]);
  const startDay = new Date(`${rangeStart}T00:00:00Z`).getUTCDay();
  const endDay = new Date(`${today}T00:00:00Z`).getUTCDay();
  const gridStart = useMemo(() => shiftDate(rangeStart, -startDay), [rangeStart, startDay]);
  const gridEnd = useMemo(() => shiftDate(today, 6 - endDay), [today, endDay]);
  const cells = useMemo(() => {
    const count =
      Math.round(
        (Date.parse(`${gridEnd}T00:00:00Z`) - Date.parse(`${gridStart}T00:00:00Z`)) / DAY,
      ) + 1;
    return Array.from({ length: count }, (_, index) => shiftDate(gridStart, index));
  }, [gridEnd, gridStart]);
  const countByDate = useMemo(
    () => new Map(entries.map((entry) => [entry.date, entry.count])),
    [entries],
  );
  const total = entries
    .filter((entry) => entry.date >= rangeStart && entry.date <= today)
    .reduce((sum, entry) => sum + entry.count, 0);
  const weekCount = cells.length / 7;
  const monthLabels = useMemo(() => {
    let previous = '';
    return Array.from({ length: weekCount }, (_, week) => {
      const date = new Date(`${cells[week * 7]!}T00:00:00Z`);
      const month = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
      if (month === previous) return null;
      previous = month;
      return { week, label: monthFormatter.format(date) };
    }).filter((item): item is { week: number; label: string } => item !== null);
  }, [cells, weekCount]);
  const [activeDate, setActiveDate] = useState(today);
  const [readoutDate, setReadoutDate] = useState(today);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [state]);

  const moveFocus = (date: string, amount: number) => {
    const next = shiftDate(date, amount);
    if (next < rangeStart || next > today) return;
    setActiveDate(next);
    setReadoutDate(next);
    requestAnimationFrame(() => cellRefs.current.get(next)?.focus());
  };

  return (
    <section className="activity-section" aria-labelledby="activity-title">
      <div className="activity-copy">
        <div>
          <h2 id="activity-title">Your activity this year</h2>
        </div>
        <p className="activity-total">
          <strong>{state === 'ready' ? total : '—'}</strong> attempts in the last 12 months
        </p>
      </div>
      {state === 'error' ? (
        <div className="calendar-state" role="alert">
          <div>
            <strong>Activity unavailable</strong>
            <span>Your saved history could not be loaded.</span>
          </div>
          {onRetry && (
            <button className="button ghost" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      ) : state === 'loading' ? (
        <div className="calendar-state" role="status">
          <span className="calendar-skeleton" />
          Loading activity…
        </div>
      ) : (
        <>
          <div className="calendar-scroll" ref={scrollRef}>
            <div
              className="calendar-layout"
              style={{ '--week-count': weekCount } as React.CSSProperties}
            >
              <div className="month-labels" aria-hidden="true">
                {monthLabels.map(({ week, label }) => (
                  <span key={`${week}-${label}`} style={{ gridColumn: week + 1 }}>
                    {label}
                  </span>
                ))}
              </div>
              <div className="weekday-labels" aria-hidden="true">
                <span>Mon</span>
                <span>Wed</span>
                <span>Fri</span>
              </div>
              <div
                className="activity-grid"
                role="grid"
                aria-label="Activity calendar for the last 12 months"
              >
                {Array.from({ length: 7 }, (_, weekday) => (
                  <div
                    className="activity-row"
                    role="row"
                    aria-rowindex={weekday + 1}
                    key={weekday}
                  >
                    {Array.from({ length: weekCount }, (_, week) => {
                      const date = cells[week * 7 + weekday]!;
                      const inRange = date >= rangeStart && date <= today;
                      if (!inRange)
                        return <span className="heat-placeholder" key={date} aria-hidden="true" />;
                      const count = countByDate.get(date) ?? 0;
                      const label = readableAttempt(date, count);
                      return (
                        <button
                          key={date}
                          ref={(node) => {
                            if (node) cellRefs.current.set(date, node);
                            else cellRefs.current.delete(date);
                          }}
                          className={`heat level-${Math.min(count, 4)}`}
                          role="gridcell"
                          aria-label={label}
                          aria-colindex={week + 1}
                          tabIndex={activeDate === date ? 0 : -1}
                          title={label}
                          onFocus={() => {
                            setActiveDate(date);
                            setReadoutDate(date);
                          }}
                          onMouseEnter={() => setReadoutDate(date)}
                          onKeyDown={(event) => {
                            const directions: Record<string, number> = {
                              ArrowLeft: -7,
                              ArrowRight: 7,
                              ArrowUp: -1,
                              ArrowDown: 1,
                            };
                            if (event.key in directions) {
                              event.preventDefault();
                              moveFocus(date, directions[event.key]!);
                            } else if (event.key === 'Home' || event.key === 'End') {
                              event.preventDefault();
                              const day = new Date(`${date}T00:00:00Z`).getUTCDay();
                              moveFocus(date, event.key === 'Home' ? -day : 6 - day);
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="calendar-footer" onMouseLeave={() => setReadoutDate(activeDate)}>
            <output aria-live="polite">
              {readableAttempt(readoutDate, countByDate.get(readoutDate) ?? 0)}
            </output>
            <div className="legend" aria-label="Activity intensity from less to more">
              <span>Less</span>
              {[0, 1, 2, 3, 4].map((level) => (
                <i className={`heat level-${level}`} key={level} />
              ))}
              <span>More</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
