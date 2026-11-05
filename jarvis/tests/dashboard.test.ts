import { describe, expect, it } from "vitest";
import { MODELS } from "@/lib/ai/models";
import { projectMonthly } from "@/lib/ai/cost";
import type { DashboardSnapshot, SnapshotEvent, SnapshotModelRun } from "@/lib/dashboard/snapshot";
import { buildDashboard, shortenTitle } from "@/lib/dashboard/view-model";
import { demoSnapshot } from "@/lib/db/demo";
import type { Goal, Task } from "@/lib/engine/types";

// Monday 28 Sep 2026, 12:00 in New York.
const NOW = new Date("2026-09-28T16:00:00Z");
const TODAY = "2026-09-28";

function goal(g: Partial<Goal> & Pick<Goal, "id" | "title">): Goal {
  return {
    domain_id: null,
    metric_type: "percent",
    target_value: 100,
    current_value: 0,
    unit: "%",
    start_date: "2026-08-29",
    target_date: "2026-12-27",
    priority: 3,
    status: "active",
    ...g,
  };
}

function ev(e: Partial<SnapshotEvent> & { occurred_at: string }): SnapshotEvent {
  return {
    id: Math.random().toString(36),
    event_type: "goal_progress",
    goal_id: null,
    task_id: null,
    quantity: 1,
    xp: 0,
    source: "manual",
    ...e,
  };
}

function task(t: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    goal_id: null,
    project_id: null,
    milestone_id: null,
    status: "todo",
    priority: 3,
    due_at: null,
    estimate_minutes: null,
    scale: "micro",
    ...t,
  };
}

function run(model: string, cost: number, input = 1000, cached = 0): SnapshotModelRun {
  return {
    model,
    input_tokens: input,
    cached_input_tokens: cached,
    output_tokens: 100,
    cost_cents: cost,
    ok: true,
    created_at: "2026-09-10T12:00:00Z",
  };
}

function snap(over: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  return {
    profile: { display_name: "Joshwa", timezone: "America/New_York", prefs: {} },
    goals: [],
    milestones: [],
    tasks: [],
    habits: [],
    events: [],
    modelRunsThisMonth: [],
    projectCount: 0,
    memoryCount: 0,
    preferenceCount: 0,
    jobCounts: { running: 0, queued: 0 },
    integrations: [],
    isDemo: false,
    ...over,
  };
}

describe("buildDashboard: goals", () => {
  it("reads goal values from the ledger, not the current_value cache", () => {
    const g = goal({ id: "a", title: "A", current_value: 99 });
    const v = buildDashboard(
      snap({ goals: [g], events: [ev({ goal_id: "a", quantity: 30, occurred_at: "2026-09-20T12:00:00Z" })] }),
      NOW,
    );
    expect(v.goals[0].current).toBe(30);
    expect(v.goals[0].percentComplete).toBeCloseTo(0.3);
  });

  it("applies negative corrections from the ledger", () => {
    const g = goal({ id: "a", title: "A" });
    const v = buildDashboard(
      snap({
        goals: [g],
        events: [
          ev({ goal_id: "a", quantity: 30, occurred_at: "2026-09-20T12:00:00Z" }),
          ev({ goal_id: "a", quantity: -10, occurred_at: "2026-09-21T12:00:00Z" }),
        ],
      }),
      NOW,
    );
    expect(v.goals[0].current).toBe(20);
  });

  it("labels count goals as current over target and percent goals as a percentage", () => {
    const v = buildDashboard(
      snap({
        goals: [
          goal({ id: "c", title: "Count", metric_type: "count", target_value: 56, unit: "sessions" }),
          goal({ id: "p", title: "Percent" }),
        ],
        events: [
          ...Array.from({ length: 11 }, (_, i) => ev({ goal_id: "c", occurred_at: `2026-09-${10 + i}T12:00:00Z` })),
          ev({ goal_id: "p", quantity: 24, occurred_at: "2026-09-20T12:00:00Z" }),
        ],
      }),
      NOW,
    );
    const byId = Object.fromEntries(v.goals.map((g) => [g.id, g]));
    expect(byId.c.valueLabel).toBe("11/56");
    expect(byId.p.valueLabel).toBe("24%");
  });

  it("excludes paused and completed goals", () => {
    const v = buildDashboard(
      snap({
        goals: [
          goal({ id: "a", title: "A" }),
          goal({ id: "b", title: "B", status: "paused" }),
          goal({ id: "c", title: "C", status: "completed" }),
        ],
      }),
      NOW,
    );
    expect(v.goals.map((g) => g.id)).toEqual(["a"]);
    expect(v.nav.goals).toBe(1);
  });

  it("keeps a goal's color when its priority changes", () => {
    const a = goal({ id: "a", title: "A", start_date: "2026-08-01", priority: 1 });
    const b = goal({ id: "b", title: "B", start_date: "2026-09-01", priority: 2 });
    const before = buildDashboard(snap({ goals: [a, b] }), NOW);
    const after = buildDashboard(snap({ goals: [{ ...a, priority: 5 }, b] }), NOW);
    const color = (v: typeof before, id: string) => v.goals.find((g) => g.id === id)!.colorIndex;
    expect(color(after, "a")).toBe(color(before, "a"));
    expect(color(after, "b")).toBe(color(before, "b"));
    // Display order does follow priority.
    expect(after.goals.map((g) => g.id)).toEqual(["b", "a"]);
  });

  it("does not count just-started or open-ended goals toward on pace", () => {
    const v = buildDashboard(
      snap({
        goals: [
          goal({ id: "new", title: "New", start_date: TODAY }),
          goal({ id: "open", title: "Open", target_date: null }),
        ],
      }),
      NOW,
    );
    expect(v.onPace.judgeable).toBe(0);
  });
});

describe("buildDashboard: attention", () => {
  it("flags a stalled goal as critical", () => {
    const v = buildDashboard(
      snap({
        goals: [goal({ id: "o", title: "ORACLE", start_date: "2026-07-30" })],
        events: [ev({ goal_id: "o", quantity: 18, occurred_at: "2026-09-12T15:00:00Z" })],
      }),
      NOW,
    );
    const stalled = v.attention.find((a) => a.key === "stalled:o");
    expect(stalled?.severity).toBe("critical");
    expect(stalled?.title).toContain("16 days");
    expect(v.criticalCount).toBe(1);
  });

  it("does not call a goal stalled when it started inside the stall window", () => {
    const v = buildDashboard(
      snap({ goals: [goal({ id: "n", title: "New", start_date: "2026-09-25" })] }),
      NOW,
    );
    expect(v.attention.some((a) => a.key.startsWith("stalled"))).toBe(false);
  });

  it("surfaces P1 tasks due within 24 hours and ignores low priority ones", () => {
    const v = buildDashboard(
      snap({
        tasks: [
          task({ id: "p1", title: "Problem set", priority: 1, due_at: "2026-09-29T12:00:00Z" }),
          task({ id: "p4", title: "Laundry", priority: 4, due_at: "2026-09-28T20:00:00Z" }),
        ],
      }),
      NOW,
    );
    expect(v.attention.find((a) => a.key === "due:p1")?.title).toBe("Problem set due in 20 hours");
    expect(v.attention.some((a) => a.key === "due:p4")).toBe(false);
  });

  it("marks an overdue P1 task critical", () => {
    const v = buildDashboard(
      snap({ tasks: [task({ id: "x", title: "Late", priority: 1, due_at: "2026-09-28T10:00:00Z" })] }),
      NOW,
    );
    expect(v.attention.find((a) => a.key === "due:x")?.severity).toBe("critical");
  });

  it("reports auto-derived activity from the last day only", () => {
    const v = buildDashboard(
      snap({
        events: [
          ev({ event_type: "commit_pushed", source: "github", quantity: 0, occurred_at: "2026-09-28T14:00:00Z" }),
          ev({ event_type: "commit_pushed", source: "github", quantity: 0, occurred_at: "2026-09-28T13:00:00Z" }),
          ev({ event_type: "commit_pushed", source: "github", quantity: 0, occurred_at: "2026-09-20T13:00:00Z" }),
          ev({ event_type: "task_completed", source: "github", quantity: 0, occurred_at: "2026-09-28T13:30:00Z" }),
        ],
      }),
      NOW,
    );
    expect(v.attention.find((a) => a.key === "auto")?.title).toBe("2 commits closed 1 task");
  });

  it("always ends with the budget projection", () => {
    const v = buildDashboard(snap(), NOW);
    expect(v.attention.at(-1)?.key).toBe("budget");
  });
});

describe("buildDashboard: budget and routing", () => {
  it("projects spend with the shared cost helper", () => {
    const v = buildDashboard(
      snap({ modelRunsThisMonth: [run(MODELS.default.id, 50), run(MODELS.advanced.id, 150)] }),
      NOW,
    );
    expect(v.budget.spentCents).toBe(200);
    expect(v.budget.projectedCents).toBeCloseTo(projectMonthly(200, 28, 30));
    expect(v.budget.state).toBe("ok");
  });

  it("excludes embeddings from the Luna and Sol split", () => {
    const v = buildDashboard(
      snap({
        modelRunsThisMonth: [
          run(MODELS.default.id, 1),
          run(MODELS.default.id, 1),
          run(MODELS.default.id, 1),
          run(MODELS.advanced.id, 5),
          run(MODELS.embedding.id, 0.1),
          run(MODELS.embedding.id, 0.1),
        ],
      }),
      NOW,
    );
    const rows = Object.fromEntries(v.routing.rows.map((r) => [r.tier, r]));
    expect(v.routing.totalCalls).toBe(4);
    expect(rows.default.share).toBeCloseTo(0.75);
    expect(rows.advanced.share).toBeCloseTo(0.25);
    expect(rows.embedding.share).toBe(0);
    expect(rows.embedding.costCents).toBeCloseTo(0.2);
  });

  it("treats cached tokens as a subset of input, never more than all of it", () => {
    const v = buildDashboard(
      snap({ modelRunsThisMonth: [run(MODELS.default.id, 1, 1000, 600), run(MODELS.default.id, 1, 1000, 5000)] }),
      NOW,
    );
    expect(v.routing.cachedInputShare).toBeCloseTo(0.8);
  });

  it("reports no cache share when nothing has run", () => {
    expect(buildDashboard(snap(), NOW).routing.cachedInputShare).toBeNull();
  });
});

describe("buildDashboard: ledger and signals", () => {
  it("buckets the last 14 local days and computes the auto-derived share", () => {
    const v = buildDashboard(
      snap({
        events: [
          // 23:30 ET on Sep 27 is Sep 28 in UTC but belongs to the 27th locally.
          ev({ occurred_at: "2026-09-28T03:30:00Z", source: "github" }),
          ev({ occurred_at: "2026-09-28T15:00:00Z", source: "manual" }),
          ev({ occurred_at: "2026-09-01T15:00:00Z", source: "manual" }),
        ],
      }),
      NOW,
    );
    expect(v.ledger.days).toHaveLength(14);
    expect(v.ledger.days.at(-1)).toEqual({ date: TODAY, count: 1 });
    expect(v.ledger.days.at(-2)).toEqual({ date: "2026-09-27", count: 1 });
    expect(v.ledger.total).toBe(3);
    expect(v.ledger.autoDerivedShare).toBeCloseTo(0.5);
  });

  it("returns null habit consistency when there are no habits", () => {
    expect(buildDashboard(snap(), NOW).signals.habitConsistency).toBeNull();
  });

  it("measures habit consistency against two weeks of targets", () => {
    const v = buildDashboard(
      snap({
        habits: [{ id: "h", name: "Lift", target_per_week: 4, active: true }],
        events: Array.from({ length: 6 }, (_, i) =>
          ev({ event_type: "habit_done", occurred_at: `2026-09-${20 + i}T15:00:00Z` }),
        ),
      }),
      NOW,
    );
    expect(v.signals.habitConsistency).toBeCloseTo(6 / 8);
  });

  it("counts days to graduation from the local day", () => {
    const v = buildDashboard(
      snap({ profile: { display_name: "J", timezone: "America/New_York", prefs: { graduation_date: "2026-12-16" } } }),
      NOW,
    );
    expect(v.profile.daysToGraduation).toBe(79);
  });
});

describe("demo snapshot", () => {
  it("renders every number without NaN or Infinity", () => {
    const v = buildDashboard(demoSnapshot(NOW), NOW);
    const bad = JSON.stringify(v, (_k, val) =>
      typeof val === "number" && !Number.isFinite(val) ? "__BAD__" : val,
    );
    expect(bad).not.toContain("__BAD__");
    expect(bad).not.toContain("NaN");
    expect(v.isDemo).toBe(true);
  });

  it("shows ORACLE as the stalled, at-risk goal", () => {
    const v = buildDashboard(demoSnapshot(NOW), NOW);
    expect(v.goals.find((g) => g.id === "g-oracle")?.paceStatus).toBe("at_risk");
    expect(v.attention[0].key).toBe("stalled:g-oracle");
  });
});

describe("shortenTitle", () => {
  it("drops a leading verb", () => {
    expect(shortenTitle("Ship JARVIS V1")).toBe("JARVIS V1");
    expect(shortenTitle("Land a SWE or data role")).toBe("SWE or data role");
  });
  it("leaves short or verb-free titles alone", () => {
    expect(shortenTitle("ORACLE to beta")).toBe("ORACLE to beta");
    expect(shortenTitle("Get fit")).toBe("Get fit");
  });
});
