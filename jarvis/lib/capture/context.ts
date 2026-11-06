import type { DashboardSnapshot } from "@/lib/dashboard/snapshot";
import { effectiveEvents } from "@/lib/engine/ledger";
import { currentValueFromEvents } from "@/lib/engine/progress";
import type { CaptureContext } from "./plan";

/** Open tasks and active count goals with their ledger values. Pure. */
export function captureContext(snap: DashboardSnapshot): CaptureContext {
  const events = effectiveEvents(snap.events);
  return {
    openTasks: snap.tasks.filter((t) => t.status === "todo" || t.status === "in_progress" || t.status === "blocked"),
    countGoals: snap.goals
      .filter((g) => g.status === "active" && g.metric_type === "count")
      .map((goal) => ({ goal, current: currentValueFromEvents(goal, events) })),
  };
}
