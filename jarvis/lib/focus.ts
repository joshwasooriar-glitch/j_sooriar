/**
 * Focus block rules. Pure. The database applies the same cap and minimum in
 * log_focus_session; these copies let the UI say what will happen before it
 * happens.
 */

/** A single session never counts for more than 4 hours. Longer means it was left running. */
export const FOCUS_CAP_MS = 4 * 60 * 60 * 1000;

/** Under a minute is a mis-click, not a session. */
export const FOCUS_MIN_MS = 60 * 1000;

/**
 * Elapsed time from two readings of a monotonic clock (performance.now()).
 * Computed from the two readings, never accumulated tick by tick, so a
 * throttled background tab or a slow interval cannot make it drift.
 */
export function elapsedBetween(startMono: number, nowMono: number): number {
  return Math.max(0, nowMono - startMono);
}

export type FocusOutcome =
  | { kind: "record"; minutes: number; capped: boolean }
  | { kind: "too_short" };

export function focusOutcome(elapsedMs: number): FocusOutcome {
  if (!Number.isFinite(elapsedMs) || elapsedMs < FOCUS_MIN_MS) return { kind: "too_short" };
  const capped = elapsedMs > FOCUS_CAP_MS;
  return { kind: "record", minutes: Math.floor(Math.min(elapsedMs, FOCUS_CAP_MS) / 60000), capped };
}

/** "4:05" under an hour, "1:02:09" over. */
export function formatElapsed(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
