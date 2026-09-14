import {
  localDateAt,
  dateRange,
  streaks,
  assertLocalDate,
} from '../../../apps/api/src/domain/calendar.js';
test.each([
  ['2026-09-11T02:59:59Z', 'America/Sao_Paulo', '2026-09-10'],
  ['2026-09-11T03:00:00Z', 'America/Sao_Paulo', '2026-09-11'],
  ['2024-03-10T06:59:59Z', 'America/New_York', '2024-03-10'],
  ['2024-03-10T07:00:00Z', 'America/New_York', '2024-03-10'],
  ['2024-11-03T06:00:00Z', 'America/New_York', '2024-11-03'],
])('stores a calendar date across midnight and DST', (at, zone, date) =>
  expect(localDateAt(at, zone)).toBe(date),
);
test('validates zones, leap days and inclusive bounded ranges', () => {
  expect(() => localDateAt(new Date(), 'Not/AZone')).toThrow('IANA');
  expect(() => localDateAt(new Date(), '+03:00')).toThrow('IANA');
  expect(() => assertLocalDate('2023-02-29')).toThrow();
  expect(dateRange('2024-02-28', '2024-03-01')).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
  expect(() => dateRange('2024-01-02', '2024-01-01')).toThrow();
  expect(() => dateRange('2024-01-01', '2024-01-03', 2)).toThrow();
});
test('counts distinct activity dates and allows yesterday for current streak', () => {
  expect(streaks(['2024-02-28', '2024-02-29', '2024-02-29'], '2024-03-01')).toEqual({
    current: 2,
    longest: 2,
  });
  expect(streaks(['2024-02-28', '2024-02-29'], '2024-03-02')).toEqual({ current: 0, longest: 2 });
  expect(streaks([], '2024-03-02')).toEqual({ current: 0, longest: 0 });
});
