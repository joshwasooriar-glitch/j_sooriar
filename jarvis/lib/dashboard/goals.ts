import { effectiveEvents } from "@/lib/engine/ledger";
import { computeGoalProgress, currentValueFromEvents } from "@/lib/engine/progress";
import type { GoalProgress } from "@/lib/engine/types";
import type { DashboardSnapshot } from "./snapshot";

/** Engine progress for every goal, any status, from the ledger. Pure. */
export function goalProgressMap(snap: DashboardSnapshot, now: Date): Map<string, { progress: GoalProgress; current: number }> {
  const tz = snap.profile.timezone || "America/New_York";
  const events = effectiveEvents(snap.events);
  return new Map(
    snap.goals.map((g) => {
      const current = currentValueFromEvents(g, events);
      return [g.id, { current, progress: computeGoalProgress({ ...g, current_value: current }, now, tz) }];
    }),
  );
}
