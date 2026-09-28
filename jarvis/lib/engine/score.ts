/**
 * Daily score and XP.
 *
 * Design rule from the spec: rest days and deliberately rescheduled work do not
 * reduce the score. A score that punishes legitimate planning is a score Joshwa
 * stops trusting, and an ignored score is worse than no score at all.
 *
 * Pure. Time injected.
 */

import type {
  ActivityEvent,
  Habit,
  ScoreBreakdown,
  ScoreWeights,
  Task,
} from "./types";
import { clamp, lastNLocalDays, localDateString } from "./time";

export const DEFAULT_WEIGHTS: ScoreWeights = {
  priority_tasks: 0.35,
  goal_progress: 0.25,
  habits: 0.15,
  schedule_adherence: 0.1,
  focus_blocks: 0.1,
  review_checkin: 0.05,
};

export interface ScoreInput {
  /** Tasks that were due today or completed today. */
  tasksDueToday: Task[];
  tasksCompletedToday: Task[];
  /** All events on the local day. */
  eventsToday: ActivityEvent[];
  activeHabits: Habit[];
  /** Calendar events that were scheduled today, and how many were attended. */
  scheduledCount: number;
  attendedCount: number;
  /** True when the evening review was completed. */
  reviewDone: boolean;
  /** A day marked rest is neutral for habits and focus, not a zero. */
  isRestDay?: boolean;
}

/**
 * Score for a single local day, 0 to 100.
 *
 * Each component returns a raw 0 to 1. A component with nothing to measure
 * returns null internally and its weight is redistributed across the rest,
 * so an empty day does not score badly for lack of data.
 */
export function computeDailyScore(
  input: ScoreInput,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): ScoreBreakdown {
  const raw: Record<keyof ScoreWeights, number | null> = {
    priority_tasks: scorePriorityTasks(input),
    goal_progress: scoreGoalProgress(input),
    habits: input.isRestDay ? null : scoreHabits(input),
    schedule_adherence: scoreSchedule(input),
    focus_blocks: input.isRestDay ? null : scoreFocus(input),
    review_checkin: input.reviewDone ? 1 : 0,
  };

  // Redistribute the weight of components that had nothing to measure.
  const live = (Object.keys(raw) as (keyof ScoreWeights)[]).filter((k) => raw[k] !== null);
  const liveWeight = live.reduce((s, k) => s + weights[k], 0);

  const components = {} as ScoreBreakdown["components"];
  let total = 0;

  for (const k of Object.keys(raw) as (keyof ScoreWeights)[]) {
    const r = raw[k];
    if (r === null) {
      components[k] = { raw: 0, weighted: 0 };
      continue;
    }
    const w = liveWeight > 0 ? weights[k] / liveWeight : 0;
    const weighted = r * w;
    components[k] = { raw: r, weighted };
    total += weighted;
  }

  return {
    score: Math.round(clamp(total, 0, 1) * 100),
    xp: input.eventsToday.reduce((s, e) => s + (Number(e.xp) || 0), 0),
    components,
  };
}

function scorePriorityTasks(i: ScoreInput): number | null {
  // Weight by priority: a P1 completion counts more than a P5.
  const weightOf = (p: number) => 6 - clamp(p, 1, 5);

  const dueWeight = i.tasksDueToday.reduce((s, t) => s + weightOf(t.priority), 0);
  const doneWeight = i.tasksCompletedToday.reduce((s, t) => s + weightOf(t.priority), 0);

  if (dueWeight === 0) {
    // Nothing was due. Completing anything is a bonus, not a requirement.
    return doneWeight > 0 ? 1 : null;
  }
  return clamp(doneWeight / dueWeight, 0, 1);
}

function scoreGoalProgress(i: ScoreInput): number | null {
  const advancing = i.eventsToday.filter(
    (e) => e.goal_id && Number(e.quantity) > 0,
  ).length;
  if (advancing === 0 && i.eventsToday.length === 0) return null;
  // Three goal-advancing events in a day is a full day's work.
  return clamp(advancing / 3, 0, 1);
}

function scoreHabits(i: ScoreInput): number | null {
  if (i.activeHabits.length === 0) return null;

  const dailyTargets = i.activeHabits.filter((h) => h.target_per_week >= 6).length;
  const done = i.eventsToday.filter((e) => e.event_type === "habit_done").length;

  // Habits with a sub-daily cadence are not expected every day, so the
  // denominator is only the near-daily ones. If none, any completion is full marks.
  if (dailyTargets === 0) return done > 0 ? 1 : null;
  return clamp(done / dailyTargets, 0, 1);
}

function scoreSchedule(i: ScoreInput): number | null {
  if (i.scheduledCount === 0) return null;
  return clamp(i.attendedCount / i.scheduledCount, 0, 1);
}

function scoreFocus(i: ScoreInput): number | null {
  const sessions = i.eventsToday.filter((e) => e.event_type === "focus_session");
  if (sessions.length === 0) return null;
  const minutes = sessions.reduce(
    (s, e) => s + (Number((e.meta as { minutes?: number } | undefined)?.minutes) || 25),
    0,
  );
  // 120 focused minutes is a full day.
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
