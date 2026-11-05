/**
 * Everything chat and capture need from the engine, derived from a snapshot.
 *
 * Pure, time injected. Goal values come from the ledger, the same way the
 * dashboard computes them, so chat and dashboard can never disagree.
 */

import { effectiveEvents } from "@/lib/engine/ledger";
import { topTasksForToday } from "@/lib/engine/next-action";
import { computeGoalProgress, currentValueFromEvents, furthestBehind } from "@/lib/engine/progress";
import { computeStreak } from "@/lib/engine/score";
import { dailyScoreFor } from "@/lib/dashboard/daily-score";
import type { Goal, GoalProgress, RankedTask, Task } from "@/lib/engine/types";
import type { DashboardSnapshot } from "@/lib/dashboard/snapshot";

export interface EngineState {
  timeZone: string;
  displayName: string;
  activeGoals: Goal[];
  progress: GoalProgress[];
  worst: GoalProgress | null;
  openTasks: Task[];
  topTasks: RankedTask[];
  overdueCount: number;
  streak: number;
  /** Null when the day has too few measurable components for a score. */
  todayScore: number | null;
  scoreCoverage: { measured: number; of: number };
  spentCents: number;
  recentEvents: { occurred_at: string; event_type: string; label: string }[];
}

export function engineState(snap: DashboardSnapshot, now: Date): EngineState {
  const tz = snap.profile.timezone || "America/New_York";

  const events = effectiveEvents(snap.events);

  const activeGoals = snap.goals
    .filter((g) => g.status === "active")
    .sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));

  const progress = activeGoals.map((g) =>
    computeGoalProgress({ ...g, current_value: currentValueFromEvents(g, events) }, now, tz),
  );
  const progressByGoal = new Map(progress.map((p) => [p.goal_id, p]));

  const openTasks = snap.tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const overdueCount = openTasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < now.getTime()).length;

  const score = dailyScoreFor(snap, events, now, tz);

  const goalTitle = new Map(activeGoals.map((g) => [g.id, g.title]));
  const recentEvents = [...events]
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    .slice(0, 8)
    .map((e) => {
      const note = typeof e.meta?.title === "string" ? e.meta.title : typeof e.meta?.note === "string" ? e.meta.note : null;
      const goal = e.goal_id ? goalTitle.get(e.goal_id) : undefined;
      const label = [e.event_type.replace(/_/g, " "), note, goal ? `(${goal})` : null].filter(Boolean).join(" ");
      return { occurred_at: e.occurred_at, event_type: e.event_type, label };
    });

  return {
    timeZone: tz,
    displayName: snap.profile.display_name || "the user",
    activeGoals,
    progress,
    worst: furthestBehind(progress),
    openTasks,
    topTasks: topTasksForToday(openTasks, now, 3, { progressByGoal }),
    overdueCount,
    streak: computeStreak(events, now, tz),
    todayScore: score.score,
    scoreCoverage: { measured: score.coverage.measured, of: score.coverage.of },
    spentCents: snap.modelRunsThisMonth.reduce((s, r) => s + (Number(r.cost_cents) || 0), 0),
    recentEvents,
  };
}

/** The next_action answer with no model: the engine's top three, with its reasons. */
export function deterministicNextAction(top: RankedTask[]): string {
  if (top.length === 0) return "Nothing open right now.";
  const lines = top.map((r, i) => {
    const why = r.reasons.length ? ` (${r.reasons.join(", ")})` : "";
    return `${i + 1}. ${r.task.title}${why}`;
  });
  return `Top ${top.length} right now:\n${lines.join("\n")}`;
}
