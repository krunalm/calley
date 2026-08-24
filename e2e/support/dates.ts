/**
 * Date helpers for the E2E suite.
 *
 * Tests anchor on a fixed reference month rather than "now" so that
 * assertions about which cells/rows are rendered stay stable regardless of
 * when the suite runs. Anything that must interact with "today" (overdue
 * tasks, the Today button) uses the `today*` helpers instead.
 */

/** Midday UTC on a given calendar day — avoids DST/midnight boundary noise. */
export function utcAt(year: number, month: number, day: number, hour = 12, minute = 0): string {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0)).toISOString();
}

export function isoPlusHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

export function isoPlusDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}

export function isoPlusMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

/** Start of a UTC day, as an ISO string. */
export function startOfUtcDay(iso: string): string {
  const d = new Date(iso);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  ).toISOString();
}

export function endOfUtcDay(iso: string): string {
  const d = new Date(iso);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999),
  ).toISOString();
}

/**
 * A range wide enough to contain anything the suite creates — the furthest any
 * spec places an item is 60 days from its anchor.
 *
 * `days` is a half-width, so the span is twice it. The listing endpoints reject
 * a range wider than `MAX_QUERY_RANGE_DAYS` (400), which bounds how much
 * recurrence expansion one request can ask for, so the default half-width has
 * to stay under half of that.
 */
export function wideRange(anchorIso: string, days = 180): { start: string; end: string } {
  return {
    start: isoPlusDays(anchorIso, -days),
    end: isoPlusDays(anchorIso, days),
  };
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayPlusHours(hours: number): string {
  return isoPlusHours(nowIso(), hours);
}

export function todayPlusDays(days: number): string {
  return isoPlusDays(nowIso(), days);
}

/** yyyy-MM-dd in UTC — matches the value format of `<input type="date">`. */
export function dateInputValue(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** HH:mm in UTC — matches the value format of `<input type="time">`. */
export function timeInputValue(iso: string): string {
  return new Date(iso).toISOString().slice(11, 16);
}

/**
 * A stable, far-future anchor used by specs that only care about relative
 * ordering. Chosen to sit clear of the current date so freshly created
 * "today" fixtures never collide with it.
 */
export const ANCHOR = utcAt(2031, 3, 12, 10);

// ─── Header formatting ──────────────────────────────────────────────
// The app renders headers with date-fns, which is a workspace dependency of
// the web app rather than of the E2E runner. These mirror the two formats
// the DateNavigator uses, in UTC (the suite pins the browser to UTC).

/** Mirrors date-fns `format(d, 'MMMM yyyy')` — e.g. "March 2031". */
export function monthYearLabel(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Mirrors date-fns `format(d, 'EEEE, MMMM d, yyyy')`. */
export function fullDateLabel(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
