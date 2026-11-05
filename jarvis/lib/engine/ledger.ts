/**
 * Reversal-aware views of the ledger.
 *
 * A reversal is a compensating row written by reverse_activity_event: event
 * type 'reversal', negated quantity and XP, and meta.reverses_event_id naming
 * the original. Nothing is ever deleted, so every count must drop both rows of
 * a reversed pair. Sums would net out on their own; counts (tasks completed
 * today, streak days, habits done) would not.
 *
 * Pure.
 */

import type { ActivityEvent } from "./types";

export const REVERSAL_EVENT_TYPE = "reversal";

/** Ids of events that a reversal row points at, as strings. */
export function reversedEventIds(events: ActivityEvent[]): Set<string> {
  const out = new Set<string>();
  for (const e of events) {
    if (e.event_type !== REVERSAL_EVENT_TYPE) continue;
    const target = e.meta?.reverses_event_id;
    if (target != null) out.add(String(target));
  }
  return out;
}

/**
 * The ledger as it effectively stands: reversal rows removed, and the events
 * they reverse removed. A reversal pointing at an event that is not in the
 * list (outside the loaded window) is simply dropped.
 */
export function effectiveEvents<T extends ActivityEvent>(events: T[]): T[] {
  const reversed = reversedEventIds(events);
  if (reversed.size === 0) return events.filter((e) => e.event_type !== REVERSAL_EVENT_TYPE);
  return events.filter((e) => e.event_type !== REVERSAL_EVENT_TYPE && !reversed.has(String(e.id)));
}

export function isReversed(event: ActivityEvent, reversed: Set<string>): boolean {
  return reversed.has(String(event.id));
}
