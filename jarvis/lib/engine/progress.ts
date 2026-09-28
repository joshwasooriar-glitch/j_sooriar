/**
 * The progress engine.
 *
 * This file is the system of record for every number Joshwa sees. A wrong pace
 * calculation is worse than a crash, because it lies quietly.
 *
 * No LLM ever computes any of this. Pure functions, time injected.
 */

import type { ActivityEvent, Goal, GoalProgress, PaceStatus } from "./types";
import { clamp, daysBetween, localDateString } from "./time";

/** Pace thresholds. paceDelta is percentComplete minus expectedProgress. */
export const PACE_THRESHOLDS = {
  ahead: 0.1,
  on_track: -0.05,
  slightly_behind: -0.15,
  behind: -0.3,
} as const;

export function paceStatusFromDelta(delta: number): PaceStatus {
  if (delta > PACE_THRESHOLDS.ahead) return "ahead";
  if (delta > PACE_THRESHOLDS.on_track) return "on_track";
  if (delta > PACE_THRESHOLDS.slightly_behind) return "slightly_behind";
  if (delta > PACE_THRESHOLDS.behind) return "behind";
  return "at_risk";
}

/**
 * Recompute a goal's current_value from the ledger.
 *
 * This is the authoritative number. goals.current_value is only a cache of it.
 * Events before the goal's start date are excluded so that backdating a start
 * date does not silently absorb unrelated history.
 */
export function currentValueFromEvents(goal: Goal, events: ActivityEvent[]): number {
  const start = new Date(`${goal.start_date}T00:00:00.000Z`).getTime();
  let total = 0;
  for (const e of events) {
    if (e.goal_id !== goal.id) continue;
    if (new Date(e.occurred_at).getTime() < start) continue;
    total += Number(e.quantity) || 0;
  }
  return total;
}

/**
 * Everything derived about one goal.
 *
 * `now` and `timeZone` are required so that "today" is the user's local day.
 */
export function computeGoalProgress(
  goal: Goal,
  now: Date,
  timeZone = "America/New_York",
): GoalProgress {
  const today = localDateString(now, timeZone);

  const daysElapsed = Math.max(0, daysBetween(goal.start_date, today));
  const hasTarget = goal.target_value != null && Number(goal.target_value) > 0;
  const target = hasTarget ? Number(goal.target_value) : null;
  const current = Number(goal.current_value) || 0;

  // ---- completion ----
  const percentComplete = hasTarget ? clamp(current / (target as number), 0, 1) : null;
  const remaining = hasTarget ? Math.max(0, (target as number) - current) : null;

  // ---- time ----
  let totalDays: number | null = null;
  let daysRemaining: number | null = null;
  let expectedProgress: number | null = null;
  let isOverdue = false;

  if (goal.target_date) {
    totalDays = daysBetween(goal.start_date, goal.target_date);
    daysRemaining = daysBetween(today, goal.target_date);
    isOverdue = daysRemaining < 0 && goal.status === "active";

    if (totalDays <= 0) {
      // Same-day or inverted range. Treat as fully elapsed rather than dividing by zero.
      expectedProgress = 1;
    } else {
      expectedProgress = clamp(daysElapsed / totalDays, 0, 1);
    }
  }

  // ---- pace ----
  let paceDelta: number | null = null;
  let paceStatus: PaceStatus;

  if (goal.status === "completed") {
    paceStatus = "ahead";
  } else if (expectedProgress == null || percentComplete == null) {
    paceStatus = "no_deadline";
  } else if (daysElapsed === 0) {
    // Started today. There is no pace to judge yet, and dividing here would
    // report every brand new goal as on track or at risk arbitrarily.
    paceDelta = percentComplete - expectedProgress;
    paceStatus = "not_started";
  } else {
    paceDelta = percentComplete - expectedProgress;
    paceStatus = paceStatusFromDelta(paceDelta);
  }

  // ---- rates and projection ----
  const actualDailyRate = daysElapsed > 0 ? current / daysElapsed : null;

  let requiredDailyRate: number | null = null;
  if (hasTarget && daysRemaining != null && remaining != null) {
    requiredDailyRate = daysRemaining > 0 ? remaining / daysRemaining : remaining > 0 ? Infinity : 0;
  }

  let projectedFinalValue: number | null = null;
  if (actualDailyRate != null && daysRemaining != null) {
    projectedFinalValue = current + actualDailyRate * Math.max(0, daysRemaining);
  }

  const willMissTarget =
    hasTarget && projectedFinalValue != null && projectedFinalValue < (target as number) * 0.995;

  return {
    goal_id: goal.id,
    title: goal.title,
    percentComplete,
    expectedProgress,
    paceDelta,
    paceStatus,
    daysElapsed,
    daysRemaining,
    totalDays,
    requiredDailyRate,
    actualDailyRate,
    projectedFinalValue,
    willMissTarget,
    remaining,
    isOverdue,
  };
}

export function computeAllGoalProgress(
  goals: Goal[],
  now: Date,
  timeZone = "America/New_York",
): GoalProgress[] {
  return goals.map((g) => computeGoalProgress(g, now, timeZone));
}

const PACE_RANK: Record<PaceStatus, number> = {
  at_risk: 0,
  behind: 1,
  slightly_behind: 2,
  on_track: 3,
  not_started: 4,
  no_deadline: 5,
  ahead: 6,
};

/**
 * The goal furthest behind pace.
 *
 * This answers the second half of "how are we doing in terms of progress
 * towards the goals", which is the Milestone 1 north star.
 */
export function furthestBehind(progress: GoalProgress[]): GoalProgress | null {
  const judgeable = progress.filter(
    (p) => p.paceStatus !== "no_deadline" && p.paceStatus !== "not_started",
  );
  if (judgeable.length === 0) return null;

  return judgeable.reduce((worst, p) => {
    const a = PACE_RANK[p.paceStatus];
    const b = PACE_RANK[worst.paceStatus];
    if (a !== b) return a < b ? p : worst;
    return (p.paceDelta ?? 0) < (worst.paceDelta ?? 0) ? p : worst;
  });
}

/** Goals with no ledger activity in `days`. Surfaces quietly stalled work. */
export function stalledGoals(
  goals: Goal[],
  events: ActivityEvent[],
  now: Date,
  days = 14,
): { goal: Goal; daysSinceActivity: number | null }[] {
  const cutoff = now.getTime() - days * 86_400_000;
  const latest = new Map<string, number>();

  for (const e of events) {
    if (!e.goal_id) continue;
    const t = new Date(e.occurred_at).getTime();
    const prev = latest.get(e.goal_id);
    if (prev === undefined || t > prev) latest.set(e.goal_id, t);
  }

  const out: { goal: Goal; daysSinceActivity: number | null }[] = [];

  for (const goal of goals) {
    if (goal.status !== "active") continue;
    const last = latest.get(goal.id);
    if (last !== undefined && last >= cutoff) continue;
    out.push({
      goal,
      daysSinceActivity:
        last === undefined ? null : Math.floor((now.getTime() - last) / 86_400_000),
    });
  }

  return out;
}

/** Formats a pace status for display. */
export function paceLabel(status: PaceStatus): string {
  switch (status) {
    case "ahead": return "ahead";
    case "on_track": return "on track";
    case "slightly_behind": return "slightly behind";
    case "behind": return "behind";
    case "at_risk": return "at risk";
    case "no_deadline": return "no deadline";
    case "not_started": return "just started";
  }
}
