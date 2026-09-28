/**
 * Date helpers for the engine.
 *
 * Rule: storage is timestamptz in UTC, but day boundaries for scores, streaks,
 * and "today" are the user's LOCAL day. A workout at 11pm ET on Monday belongs
 * to Monday, not to Tuesday UTC.
 *
 * Pure. No Date.now() anywhere in this file.
 */

const MS_PER_DAY = 86_400_000;

/**
 * The calendar date in a given IANA timezone, as YYYY-MM-DD.
 * Uses Intl rather than offset arithmetic so DST is handled correctly.
 */
export function localDateString(instant: Date, timeZone: string): string {
  return dateFormatter(timeZone).format(instant);
}

// Constructing an Intl.DateTimeFormat is far more expensive than using one, and
// the dashboard calls this once per ledger row. Formatters are stateless, so
// caching one per zone is safe.
const DATE_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = DATE_FORMATTERS.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    DATE_FORMATTERS.set(timeZone, f);
  }
  return f;
}

/** Parse YYYY-MM-DD as a UTC midnight instant. Date-only values carry no zone. */
export function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Whole days between two calendar dates. Positive when `to` is later.
 * Both arguments are YYYY-MM-DD.
 */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDateOnly(to).getTime() - parseDateOnly(from).getTime()) / MS_PER_DAY);
}

export function addDays(iso: string, n: number): string {
  const d = parseDateOnly(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Start of the local day, as a UTC instant. */
export function startOfLocalDay(instant: Date, timeZone: string): Date {
  const dayStr = localDateString(instant, timeZone);
  // Find the UTC instant whose local date is dayStr and local time is 00:00.
  // Probe at UTC midnight then correct by the observed offset.
  const probe = parseDateOnly(dayStr);
  const offsetMin = timeZoneOffsetMinutes(probe, timeZone);
  return new Date(probe.getTime() - offsetMin * 60_000);
}

/** Offset in minutes of `timeZone` from UTC at `instant`. East of UTC is positive. */
export function timeZoneOffsetMinutes(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(instant).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUTC - instant.getTime()) / 60_000);
}

/** Inclusive list of local date strings for the last `n` days ending at `now`. */
export function lastNLocalDays(now: Date, timeZone: string, n: number): string[] {
  const today = localDateString(now, timeZone);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(today, -i));
  return out;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
