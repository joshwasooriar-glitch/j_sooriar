import { timeZoneOffsetMinutes } from "@/lib/engine/time";

/**
 * A <input type="datetime-local"> value ("2026-11-05T14:30") carries no zone.
 * It means wall-clock time in the user's timezone. Returns the UTC ISO string.
 *
 * Two passes, because the offset depends on the instant: the first guess can
 * land on the wrong side of a DST change, the second corrects it.
 */
export function localDateTimeToIso(local: string, timeZone: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new Error(`Not a local date-time: ${local}`);
  const [, y, mo, d, h, mi] = m.map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let utc = wall - timeZoneOffsetMinutes(new Date(wall), timeZone) * 60_000;
  utc = wall - timeZoneOffsetMinutes(new Date(utc), timeZone) * 60_000;
  return new Date(utc).toISOString();
}

/** The reverse, for prefilling an edit form. */
export function isoToLocalDateTime(iso: string, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
