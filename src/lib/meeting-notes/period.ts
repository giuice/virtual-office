// src/lib/meeting-notes/period.ts
// Meeting-date period filter: local calendar days ('YYYY-MM-DD' from a date
// input) turned into the search route's bounds — ISO date-times with the
// viewer's UTC offset; `from` is the start of the first day (inclusive) and
// `to` the start of the day after the last day (exclusive).

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number, width = 2): string {
  return String(Math.abs(value)).padStart(width, '0');
}

/** Local midnight of a 'YYYY-MM-DD' day plus `addDays`; null when the day is not a real date. */
function localMidnight(day: string, addDays: number): Date | null {
  const match = DAY_PATTERN.exec(day);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  if (year < 1000 || month < 1 || month > 12 || date < 1 || date > 31) return null;
  const value = new Date(2000, 0, 1, 0, 0, 0, 0);
  // setFullYear avoids the two-digit-year mapping of the Date constructor.
  value.setFullYear(year, month - 1, date);
  if (value.getFullYear() !== year || value.getMonth() !== month - 1 || value.getDate() !== date) {
    return null;
  }
  if (addDays !== 0) value.setDate(value.getDate() + addDays);
  return value;
}

/** ISO 8601 local date-time with offset, e.g. 2026-10-13T00:00:00.000-03:00. */
export function toLocalIsoWithOffset(value: Date): string {
  const offsetMinutes = -value.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  return (
    `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` +
    `T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}.${pad(value.getMilliseconds(), 3)}` +
    `${sign}${pad(Math.floor(Math.abs(offsetMinutes) / 60))}:${pad(Math.abs(offsetMinutes) % 60)}`
  );
}

export type MeetingPeriodResult =
  | { ok: true; from: string | null; to: string | null }
  | { ok: false; reason: 'invalid-day' | 'from-after-to' };

/** Resolves the period inputs ('' = open bound) to the route's `from`/`to`. */
export function resolveMeetingPeriod(fromDay: string, toDay: string): MeetingPeriodResult {
  const fromDate = fromDay ? localMidnight(fromDay, 0) : null;
  const toDate = toDay ? localMidnight(toDay, 1) : null;
  if ((fromDay && !fromDate) || (toDay && !toDate)) return { ok: false, reason: 'invalid-day' };
  if (fromDate && toDate && fromDate.getTime() >= toDate.getTime()) {
    return { ok: false, reason: 'from-after-to' };
  }
  return {
    ok: true,
    from: fromDate ? toLocalIsoWithOffset(fromDate) : null,
    to: toDate ? toLocalIsoWithOffset(toDate) : null,
  };
}

/** The local calendar day 'YYYY-MM-DD' of an instant; '' when unparsable. */
export function localDayOf(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

/**
 * A meeting date picked as a local day → local noon of that day as an ISO
 * date-time with offset (noon stays inside the same calendar day for viewers
 * a few hours away); null when the day is not a real date.
 */
export function meetingDateFromLocalDay(day: string): string | null {
  const midnight = localMidnight(day, 0);
  if (!midnight) return null;
  midnight.setHours(12, 0, 0, 0);
  return toLocalIsoWithOffset(midnight);
}
