/**
 * Display formatting for the dashboard. Pure, time injected.
 *
 * Formatting only. Nothing in here decides a number; it renders one.
 */

import type { PaceStatus } from "@/lib/engine/types";
import { parseDateOnly } from "@/lib/engine/time";

/** Color and glyph always travel together so status survives grayscale and colorblindness. */
export const PACE_DISPLAY: Record<PaceStatus, { label: string; glyph: string; tone: PaceTone }> = {
  ahead: { label: "Ahead", glyph: "●", tone: "good" },
  on_track: { label: "On track", glyph: "●", tone: "good" },
  slightly_behind: { label: "Slightly behind", glyph: "◐", tone: "warn" },
  behind: { label: "Behind", glyph: "▲", tone: "orange" },
  at_risk: { label: "At risk", glyph: "▲▲", tone: "bad" },
  no_deadline: { label: "No deadline", glyph: "○", tone: "muted" },
  not_started: { label: "Just started", glyph: "○", tone: "muted" },
};

export type PaceTone = "good" | "warn" | "orange" | "bad" | "muted";

export function pct(fraction: number | null, digits = 0): string {
  if (fraction == null) return "n/a";
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function compactNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

/** "DEC 12" from a YYYY-MM-DD date. Date-only values carry no zone, so format in UTC. */
export function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(parseDateOnly(iso))
    .toUpperCase();
}

/** "Oct 12" from a YYYY-MM-DD date. */
export function friendlyDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    parseDateOnly(iso),
  );
}

/** "14:00" local. */
export function clockTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(instant);
}

/** "in 1h 58m", "in 20h", "3h ago". */
export function relativeHours(target: Date, now: Date): string {
  const diffMin = Math.round((target.getTime() - now.getTime()) / 60_000);
  const abs = Math.abs(diffMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const body = h === 0 ? `${m}m` : h >= 10 || m === 0 ? `${h}h` : `${h}h ${m}m`;
  return diffMin >= 0 ? `in ${body}` : `${body} ago`;
}

export function minutesLabel(min: number | null): string | null {
  if (min == null) return null;
  return `${min} min`;
}

/** Trim trailing zeros: 11 not 11.00, 3.5 not 3.50. */
export function trimNumber(n: number, digits = 1): string {
  return Number(n.toFixed(digits)).toString();
}
