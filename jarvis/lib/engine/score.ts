/**
 * Daily score and XP.
 *
 * Design rules:
 *   - Rest days and deliberately rescheduled work do not reduce the score.
 *   - A component with nothing to measure is null, never zero. "Nothing was
 *     scheduled" must not read the same as "scheduled and missed".
 *   - Too little evidence means no number at all, with a coverage readout.
 *   - The evening review is consistency, not performance, and is reported
 *     beside the score rather than inside it.
 *
 * A score Joshwa cannot trust is worse than no score.
 *
 * Pure. Time injected.
 */

import type {
  ActivityEvent,
  Habit,
  PerformanceComponent,
  ScoreBreakdown,
  ScoreWeights,
  Task,
} from "./types";
import { clamp, lastNLocalDays, localDateString } from "./time";

export const PERFORMANCE_COMPONENTS: readonly PerformanceComponent[] = [
  "priority_tasks",
  "goal_progress",
  "habits",
  "schedule_adherence",
  "focus_blocks",
];

/** Relative weights. Only measurable components share them, so they need not sum to 1. */
export const DEFAULT_WEIGHTS: ScoreWeights = {
  priority_tasks: 0.35,
  goal_progress: 0.25,
  habits: 0.15,
  schedule_adherence: 0.1,
  focus_blocks: 0.1,
};

/** Below this many measurable components the day shows "Score unavailable". */
export const MIN_MEASURED_COMPONENTS = 2;

export interface ScoreInput {
  /** Tasks due today (any status except cancelled). */
  tasksDueToday: Task[];
  tasksCompletedToday: Task[];
  /** All events on the local day, reversals already removed. */
  eventsToday: ActivityEvent[];
  activeHabits: Habit[];
  /** Active goals that have a target date. Goal progress is measurable only if this is above 0. */
  activeGoalsWithDeadline: number;
  /** Calendar events scheduled today, and how many were attended. */
  scheduledCount: number;
  attendedCount: number;
  /** Evening review done. Reported as consistency, never scored. */
  reviewDone: boolean;
  /** A rest day makes habits and focus not measurable rather than zero. */
  isRestDay?: boolean;
}

/**
 * The daily performance score.
 *
 * Each component is a number from 0 to 1, or null when there was nothing to
 * measure. Weight is redistributed only among measurable components, and the
 * day gets a number only when at least MIN_MEASURED_COMPONENTS were
 * measurable. A day with too little evidence says so instead of guessing.
 */
export function computeDailyScore(
  input: ScoreInput,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): ScoreBreakdown {
  const raw: Record<PerformanceComponent, number | null> = {
    priority_tasks: scorePriorityTasks(input),
    goal_progress: scoreGoalProgress(input),
    habits: input.isRestDay ? null : scoreHabits(input),
    schedule_adherence: scoreSchedule(input),
    focus_blocks: input.isRestDay ? null : scoreFocus(input),
  };

  const measured = PERFORMANCE_COMPONENTS.filter((k) => raw[k] !== null);
  const liveWeight = measured.reduce((s, k) => s + Math.max(0, weights[k]), 0);
  const scored = measured.length >= MIN_MEASURED_COMPONENTS && liveWeight > 0;

  const components = {} as ScoreBreakdown["components"];
  let total = 0;
  for (const k of PERFORMANCE_COMPONENTS) {
    const r = raw[k];
    if (r === null || !scored) {
      components[k] = { raw: r, weighted: null };
      continue;
    }
    const weighted = r * (Math.max(0, weights[k]) / liveWeight);
    components[k] = { raw: r, weighted };
    total += weighted;
  }

  return {
    score: scored ? Math.round(clamp(total, 0, 1) * 100) : null,
    xp: input.eventsToday.reduce((s, e) => s + (Number(e.xp) || 0), 0),
    coverage: { measured: measured.length, of: PERFORMANCE_COMPONENTS.length, components: measured },
    components,
    consistency: { reviewDone: input.reviewDone },
  };
}

/**
 * Weights from profiles.prefs.score_weights, falling back to the defaults per
 * key. Unknown keys (including the retired review_checkin) are ignored, and a
 * negative or non-numeric value falls back rather than poisoning the sum.
 */
export function resolveWeights(fromPrefs: unknown): ScoreWeights {
  const out: ScoreWeights = { ...DEFAULT_WEIGHTS };
  if (!fromPrefs || typeof fromPrefs !== "object") return out;
  const src = fromPrefs as Record<string, unknown>;
  for (const k of PERFORMANCE_COMPONENTS) {
    const v = Number(src[k]);
    if (src[k] != null && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}

/** Nothing due today is not measurable, even if something got done anyway. */
function scorePriorityTasks(i: ScoreInput): number | null {
  // Weight by priority: a P1 completion counts more than a P5.
  const weightOf = (p: number) => 6 - clamp(p, 1, 5);
  const dueWeight = i.tasksDueToday.reduce((s, t) => s + weightOf(t.priority), 0);
  if (dueWeight === 0) return null;
  const dueIds = new Set(i.tasksDueToday.map((t) => t.id));
  const doneWeight = i.tasksCompletedToday
    .filter((t) => dueIds.has(t.id))
    .reduce((s, t) => s + weightOf(t.priority), 0);
  return clamp(doneWeight / dueWeight, 0, 1);
}

/** Measurable when there is a goal with a deadline to move. Three advancing events is a full day. */
function scoreGoalProgress(i: ScoreInput): number | null {
  if (i.activeGoalsWithDeadline <= 0) return null;
  const advancing = i.eventsToday.filter((e) => e.goal_id && Number(e.quantity) > 0).length;
  return clamp(advancing / 3, 0, 1);
}

/** Measurable when at least one near-daily habit (6 or 7 a week) is active. */
function scoreHabits(i: ScoreInput): number | null {
  const expected = i.activeHabits.filter((h) => h.active && h.target_per_week >= 6).length;
  if (expected === 0) return null;
  const done = i.eventsToday.filter((e) => e.event_type === "habit_done").length;
  return clamp(done / expected, 0, 1);
}

/** Nothing scheduled is null. Scheduled and missed is 0. */
function scoreSchedule(i: ScoreInput): number | null {
  if (i.scheduledCount <= 0) return null;
  return clamp(i.attendedCount / i.scheduledCount, 0, 1);
}

/** Measurable only once a session exists; 120 focused minutes is a full day. */
function scoreFocus(i: ScoreInput): number | null {
  const sessions = i.eventsToday.filter((e) => e.event_type === "focus_session");
  if (sessions.length === 0) return null;
  const minutes = sessions.reduce(
    (s, e) => s + (Number((e.meta as { minutes?: number } | undefined)?.minutes) || 0),
    0,
  );
  return clamp(minutes / 120, 0, 1);
}

/**
 * Current streak in days, counting back from today.
 *
 * A day counts toward the streak if any activity event occurred on it. Today is
 * not counted against the streak if it is still in progress, so the streak does
 * not visibly break at midnight and repair itself at 9am.
 */
export function computeStreak(
  events: ActivityEvent[],
  now: Date,
  timeZone = "America/New_York",
): number {
  const active = new Set(
    events.map((e) => localDateString(new Date(e.occurred_at), timeZone)),
  );

  const days = lastNLocalDays(now, timeZone, 400).reverse(); // today first
  let streak = 0;

  for (let i = 0; i < days.length; i++) {
    if (active.has(days[i])) {
      streak++;
      continue;
    }
    // Grace for today only: an empty today does not break yesterday's streak.
    if (i === 0) continue;
    break;
  }
  return streak;
}

/** Level curve. Each level costs 15% more XP than the last. */
export function levelFromXp(totalXp: number): { level: number; intoLevel: number; nextAt: number } {
  let level = 1;
  let need = 100;
  let remaining = Math.max(0, totalXp);

  while (remaining >= need) {
    remaining -= need;
    level++;
    need = Math.round(need * 1.15);
  }
  return { level, intoLevel: remaining, nextAt: need };
}
