"use client";

/**
 * One focus session per page, shared by every Focus button (sidebar and quick
 * command) through useSyncExternalStore, so two buttons can never disagree.
 *
 * While the page is open, elapsed time is the difference between two
 * performance.now() readings: monotonic, unaffected by wall-clock changes or
 * throttled timers. performance.now() restarts on reload, so a running session
 * is also persisted with its wall-clock start and recovered from that after a
 * refresh (marked recovered). Storage failures are ignored: the session then
 * simply does not survive a reload.
 */

import { elapsedBetween } from "@/lib/focus";

const KEY = "jarvis.focus.v1";

export type FocusState =
  | { status: "idle" }
  | { status: "running"; ref: string; startMono: number | null; startEpoch: number; recovered: boolean };

let state: FocusState = { status: "idle" };
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { ref?: unknown; startEpoch?: unknown };
    if (typeof saved.ref === "string" && typeof saved.startEpoch === "number") {
      state = { status: "running", ref: saved.ref, startMono: null, startEpoch: saved.startEpoch, recovered: true };
    }
  } catch {
    // Unreadable storage: start idle.
  }
}

export const focusStore = {
  subscribe(listener: () => void) {
    hydrate();
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get(): FocusState {
    hydrate();
    return state;
  },
  getServer(): FocusState {
    return { status: "idle" };
  },
  start() {
    if (state.status === "running") return;
    state = {
      status: "running",
      ref: crypto.randomUUID(),
      startMono: performance.now(),
      startEpoch: Date.now(),
      recovered: false,
    };
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ ref: state.ref, startEpoch: state.startEpoch }));
    } catch {
      // Not persisted; the session still runs on this page.
    }
    emit();
  },
  /** Elapsed ms: monotonic on this page, wall clock only for a session recovered after reload. */
  elapsed(): number {
    if (state.status !== "running") return 0;
    return state.startMono != null
      ? elapsedBetween(state.startMono, performance.now())
      : Math.max(0, Date.now() - state.startEpoch);
  },
  clear() {
    state = { status: "idle" };
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      // Nothing to clear.
    }
    emit();
  },
};
