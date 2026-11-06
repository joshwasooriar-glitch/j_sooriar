/**
 * The one place a DashboardSnapshot becomes a ScoreInput. The dashboard and
 * chat both call this, so they can never score the same day differently.
 *
 * Pure, time injected.
 */

import { computeDailyScore, resolveWeights } from "@/lib/engine/score";
import { localDateString } from "@/lib/engine/time";
import type { ScoreBreakdown } from "@/lib/engine/types";
import type { DashboardSnapshot, SnapshotEvent } from "./snapshot";

export function dailyScoreFor(
  snap: DashboardSnapshot,
  events: SnapshotEvent[],
  now: Date,
  tz: string,
): ScoreBreakdown {
  const today = localDateString(now, tz);
  const eventsToday = events.filter((e) => localDateString(new Date(e.occurred_at), tz) === today);
  const completedIds = new Set(
    eventsToday.filter((e) => e.event_type === "task_completed" && e.task_id).map((e) => e.task_id),
  );

  return computeDailyScore(
    {
      tasksDueToday: snap.tasks.filter(
        (t) => t.status !== "cancelled" && t.due_at != null && localDateString(new Date(t.due_at), tz) === today,
      ),
      tasksCompletedToday: snap.tasks.filter((t) => completedIds.has(t.id)),
      eventsToday,
      activeHabits: snap.habits.filter((h) => h.active),
      activeGoalsWithDeadline: snap.goals.filter((g) => g.status === "active" && g.target_date != null).length,
      // Calendar sync is Milestone 2. Nothing scheduled means not measurable, not zero.
      scheduledCount: 0,
      attendedCount: 0,
      reviewDone: eventsToday.some((e) => e.event_type === "review_completed"),
    },
    resolveWeights(snap.profile.prefs.score_weights),
  );
}
