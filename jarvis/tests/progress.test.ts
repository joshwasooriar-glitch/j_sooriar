import { describe, expect, it } from "vitest";
import {
  computeGoalProgress,
  currentValueFromEvents,
  furthestBehind,
  paceStatusFromDelta,
  stalledGoals,
} from "../lib/engine/progress";
import type { ActivityEvent, Goal } from "../lib/engine/types";

const TZ = "America/New_York";

/** 2026-10-15 at 12:00 ET. Mid-month, mid-day, no DST edge. */
const NOW = new Date("2026-10-15T16:00:00.000Z");

function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    title: "Test goal",
    domain_id: null,
    metric_type: "count",
    target_value: 100,
    current_value: 0,
    unit: "units",
    start_date: "2026-10-01",
    target_date: "2026-10-31",
    priority: 1,
    status: "active",
    ...over,
  };
}

describe("paceStatusFromDelta", () => {
  it("classifies each band", () => {
    expect(paceStatusFromDelta(0.2)).toBe("ahead");
    expect(paceStatusFromDelta(0.0)).toBe("on_track");
    expect(paceStatusFromDelta(-0.04)).toBe("on_track");
    expect(paceStatusFromDelta(-0.1)).toBe("slightly_behind");
    expect(paceStatusFromDelta(-0.2)).toBe("behind");
    expect(paceStatusFromDelta(-0.5)).toBe("at_risk");
  });

  it("puts boundary values in the lower band", () => {
    // Thresholds are exclusive, so exactly -0.05 is not on_track.
    expect(paceStatusFromDelta(-0.05)).toBe("slightly_behind");
    expect(paceStatusFromDelta(0.1)).toBe("on_track");
  });
});

describe("computeGoalProgress", () => {
  it("computes the straightforward on-pace case", () => {
    // 14 of 30 days elapsed = 46.7% expected. 47 of 100 done = 47%.
    const p = computeGoalProgress(goal({ current_value: 47 }), NOW, TZ);

    expect(p.daysElapsed).toBe(14);
    expect(p.totalDays).toBe(30);
    expect(p.daysRemaining).toBe(16);
    expect(p.percentComplete).toBeCloseTo(0.47, 5);
    expect(p.expectedProgress).toBeCloseTo(14 / 30, 5);
    expect(p.paceStatus).toBe("on_track");
    expect(p.remaining).toBe(53);
  });

  it("flags a goal that is badly behind", () => {
    const p = computeGoalProgress(goal({ current_value: 5 }), NOW, TZ);
    expect(p.percentComplete).toBeCloseTo(0.05, 5);
    expect(p.paceDelta).toBeLessThan(-0.3);
    expect(p.paceStatus).toBe("at_risk");
    expect(p.willMissTarget).toBe(true);
  });

  it("flags a goal that is ahead", () => {
    const p = computeGoalProgress(goal({ current_value: 85 }), NOW, TZ);
    expect(p.paceStatus).toBe("ahead");
    expect(p.willMissTarget).toBe(false);
  });

  // ---- the boundaries that break naive implementations ----

  it("does not divide by zero when the goal starts today", () => {
    const p = computeGoalProgress(
      goal({ start_date: "2026-10-15", current_value: 0 }),
      NOW,
      TZ,
    );
    expect(p.daysElapsed).toBe(0);
    expect(p.paceStatus).toBe("not_started");
    expect(Number.isFinite(p.expectedProgress ?? 0)).toBe(true);
    expect(p.actualDailyRate).toBeNull();
  });

  it("does not divide by zero when start and target are the same day", () => {
    const p = computeGoalProgress(
      goal({ start_date: "2026-10-15", target_date: "2026-10-15", current_value: 0 }),
      NOW,
      TZ,
    );
    expect(p.totalDays).toBe(0);
    expect(p.expectedProgress).toBe(1);
    expect(Number.isNaN(p.expectedProgress ?? NaN)).toBe(false);
  });

  it("handles a null target_value without producing NaN", () => {
    const p = computeGoalProgress(goal({ target_value: null, current_value: 12 }), NOW, TZ);
    expect(p.percentComplete).toBeNull();
    expect(p.remaining).toBeNull();
    expect(p.paceStatus).toBe("no_deadline");
    expect(p.willMissTarget).toBe(false);
  });

  it("handles a target_value of zero without dividing by zero", () => {
    const p = computeGoalProgress(goal({ target_value: 0, current_value: 0 }), NOW, TZ);
    expect(p.percentComplete).toBeNull();
    expect(Number.isNaN(p.percentComplete ?? 0)).toBe(false);
  });

  it("handles a null target_date", () => {
    const p = computeGoalProgress(goal({ target_date: null, current_value: 40 }), NOW, TZ);
    expect(p.daysRemaining).toBeNull();
    expect(p.expectedProgress).toBeNull();
    expect(p.paceStatus).toBe("no_deadline");
    expect(p.percentComplete).toBeCloseTo(0.4, 5);
  });

  it("marks an unfinished past-deadline goal overdue", () => {
    const p = computeGoalProgress(
      goal({ target_date: "2026-10-01", current_value: 30 }),
      NOW,
      TZ,
    );
    expect(p.isOverdue).toBe(true);
    expect(p.daysRemaining).toBeLessThan(0);
    expect(p.requiredDailyRate).toBe(Infinity);
  });

  it("clamps overachievement to 100 percent", () => {
    const p = computeGoalProgress(goal({ current_value: 250 }), NOW, TZ);
    expect(p.percentComplete).toBe(1);
    expect(p.remaining).toBe(0);
  });

  it("does not report a completed goal as behind", () => {
    const p = computeGoalProgress(
      goal({ status: "completed", current_value: 100 }),
      NOW,
      TZ,
    );
    expect(p.paceStatus).toBe("ahead");
  });

  it("computes required and actual daily rates", () => {
    // 20 done in 14 days, 80 left over 16 days.
    const p = computeGoalProgress(goal({ current_value: 20 }), NOW, TZ);
    expect(p.actualDailyRate).toBeCloseTo(20 / 14, 5);
    expect(p.requiredDailyRate).toBeCloseTo(80 / 16, 5);
    expect(p.projectedFinalValue).toBeCloseTo(20 + (20 / 14) * 16, 4);
    expect(p.willMissTarget).toBe(true);
  });

  it("is stable regardless of the hour within a local day", () => {
    const morning = new Date("2026-10-15T11:00:00.000Z"); // 7am ET
    const night = new Date("2026-10-16T03:00:00.000Z"); // 11pm ET, same local day
    const a = computeGoalProgress(goal({ current_value: 47 }), morning, TZ);
    const b = computeGoalProgress(goal({ current_value: 47 }), night, TZ);
    expect(a.daysElapsed).toBe(b.daysElapsed);
    expect(a.paceStatus).toBe(b.paceStatus);
  });
});

describe("currentValueFromEvents", () => {
  const g = goal({ start_date: "2026-10-01" });

  const events: ActivityEvent[] = [
    { id: 1, event_type: "x", occurred_at: "2026-10-05T12:00:00Z", goal_id: "g1", quantity: 10, xp: 0 },
    { id: 2, event_type: "x", occurred_at: "2026-10-06T12:00:00Z", goal_id: "g1", quantity: 5, xp: 0 },
    { id: 3, event_type: "x", occurred_at: "2026-10-07T12:00:00Z", goal_id: "other", quantity: 99, xp: 0 },
    { id: 4, event_type: "x", occurred_at: "2026-09-20T12:00:00Z", goal_id: "g1", quantity: 100, xp: 0 },
  ];

  it("sums only this goal's events", () => {
    expect(currentValueFromEvents(g, events)).toBe(15);
  });

  it("excludes events before the goal start date", () => {
    // The 100 on Sep 20 predates the Oct 1 start and must not be absorbed.
    expect(currentValueFromEvents(g, events)).toBe(15);
  });

  it("applies negative corrections", () => {
    const withCorrection: ActivityEvent[] = [
      ...events,
      { id: 5, event_type: "correction", occurred_at: "2026-10-08T12:00:00Z", goal_id: "g1", quantity: -3, xp: 0 },
    ];
    expect(currentValueFromEvents(g, withCorrection)).toBe(12);
  });

  it("returns zero for a goal with no events", () => {
    expect(currentValueFromEvents(goal({ id: "empty" }), events)).toBe(0);
  });
});

describe("furthestBehind", () => {
  it("picks the worst pace status, then the worst delta within it", () => {
    const progress = [
      computeGoalProgress(goal({ id: "a", title: "A", current_value: 90 }), NOW, TZ),
      computeGoalProgress(goal({ id: "b", title: "B", current_value: 10 }), NOW, TZ),
      computeGoalProgress(goal({ id: "c", title: "C", current_value: 2 }), NOW, TZ),
    ];
    expect(furthestBehind(progress)?.goal_id).toBe("c");
  });

  it("ignores goals with no deadline", () => {
    const progress = [
      computeGoalProgress(goal({ id: "a", target_date: null, current_value: 0 }), NOW, TZ),
      computeGoalProgress(goal({ id: "b", current_value: 40 }), NOW, TZ),
    ];
    expect(furthestBehind(progress)?.goal_id).toBe("b");
  });

  it("returns null when nothing is judgeable", () => {
    const progress = [
      computeGoalProgress(goal({ id: "a", target_date: null }), NOW, TZ),
    ];
    expect(furthestBehind(progress)).toBeNull();
  });
});

describe("stalledGoals", () => {
  it("flags goals with no activity in the window", () => {
    const goals = [goal({ id: "fresh" }), goal({ id: "stale" }), goal({ id: "never" })];
    const events: ActivityEvent[] = [
      { id: 1, event_type: "x", occurred_at: "2026-10-14T12:00:00Z", goal_id: "fresh", quantity: 1, xp: 0 },
      { id: 2, event_type: "x", occurred_at: "2026-09-10T12:00:00Z", goal_id: "stale", quantity: 1, xp: 0 },
    ];

    const stalled = stalledGoals(goals, events, NOW, 14).map((s) => s.goal.id);
    expect(stalled).toContain("stale");
    expect(stalled).toContain("never");
    expect(stalled).not.toContain("fresh");
  });

  it("reports null days for a goal that never had activity", () => {
    const stalled = stalledGoals([goal({ id: "never" })], [], NOW, 14);
    expect(stalled[0].daysSinceActivity).toBeNull();
  });

  it("ignores paused goals", () => {
    const stalled = stalledGoals([goal({ id: "p", status: "paused" })], [], NOW, 14);
    expect(stalled).toHaveLength(0);
  });
});
