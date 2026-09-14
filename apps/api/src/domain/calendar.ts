import { DomainError } from './domain-error.js';
export const DAY_MS = 86_400_000;
export function assertInstant(value: string | Date): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new DomainError('INVALID_INSTANT', 'Invalid timestamp.');
  return date;
}
export function localDateAt(instant: string | Date, timezone: string): string {
  try {
    if (!timezone || /^[+-]/.test(timezone)) throw new Error('Not an IANA zone');
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(assertInstant(instant));
    const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    throw new DomainError('INVALID_TIMEZONE', 'A valid IANA timezone is required.');
  }
}
export function assertLocalDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new DomainError('INVALID_DATE', 'Expected YYYY-MM-DD.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new DomainError('INVALID_DATE', 'Invalid calendar date.');
  return value;
}
export function addCalendarDays(value: string, days: number): string {
  assertLocalDate(value);
  if (!Number.isSafeInteger(days)) throw new DomainError('INVALID_DATE', 'Invalid day offset.');
  return new Date(new Date(`${value}T00:00:00Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}
export function dateRange(from: string, to: string, maximum = 3660): string[] {
  assertLocalDate(from);
  assertLocalDate(to);
  const count = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
  if (count < 1 || count > maximum)
    throw new DomainError('INVALID_RANGE', 'Date range is out of bounds.');
  return Array.from({ length: count }, (_, index) => addCalendarDays(from, index));
}
export function streaks(
  dates: readonly string[],
  today: string,
): { current: number; longest: number } {
  assertLocalDate(today);
  const unique = [...new Set(dates.map(assertLocalDate))].sort();
  let longest = 0;
  let run = 0;
  let previous: string | undefined;
  for (const date of unique) {
    run = previous && addCalendarDays(previous, 1) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }
  const set = new Set(unique);
  let cursor = set.has(today) ? today : addCalendarDays(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = addCalendarDays(cursor, -1);
  }
  return { current, longest };
}
