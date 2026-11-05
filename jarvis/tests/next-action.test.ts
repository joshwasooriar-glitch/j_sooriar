import { describe, expect, it } from "vitest";
import { rankTasks, scoreTask, topTasksForToday } from "../lib/engine/next-action";
import { computeGoalProgress } from "../lib/engine/progress";
import type { Goal, GoalProgress, Task } from "../lib/engine/types";

const NOW = new Date("2026-10-15T16:00:00.000Z");
const TZ = "America/New_York";

function task(over: Partial<Task> = {}): Task {
  return {
    id: over.title ?? Math.random().toString(36).slice(2),
    title: "task",
    goal_id: null,
    project_id: null,
    milestone_id: null,
    status: "todo",
    priority: 3,
    due_at: null,
    estimate_minutes: 60,
    scale: "micro",
    ...over,
  };
}

function hoursFromNow(h: number): string {
  return new Date(NOW.getTime() + h * 3_600_000).toISOString();
}

describe("scoreTask", () => {
  it("ranks overdue above due today", () => {
    const overdue = scoreTask(task({ due_at: hoursFromNow(-48) }), NOW);
    const dueToday = scoreTask(task({ due_at: hoursFromNow(6) }), NOW);
    expect(overdue.score).toBeGreaterThan(dueToday.score);
    expect(overdue.reasons.join(" ")).toContain("overdue");
  });

  it("ranks high priority above low priority, all else equal", () => {
    const p1 = scoreTask(task({ priority: 1 }), NOW);
    const p5 = scoreTask(task({ priority: 5 }), NOW);
    expect(p1.score).toBeGreaterThan(p5.score);
  });

  it("boosts a task attached to an at-risk goal", () => {
    const g: Goal = {
      id: "g1", title: "G", domain_id: null, metric_type: "count",
      target_value: 100, current_value: 2, unit: null,
      start_date: "2026-10-01", target_date: "2026-10-31",
      priority: 1, status: "active",
    };
    const progressByGoal = new Map<string, GoalProgress>([
      ["g1", computeGoalProgress(g, NOW, TZ)],
    ]);

    const attached = scoreTask(task({ goal_id: "g1" }), NOW, { progressByGoal });
    const orphan = scoreTask(task({ goal_id: null }), NOW, { progressByGoal });

    expect(attached.score).toBeGreaterThan(orphan.score);
    expect(attached.reasons).toContain("goal at risk");
  });

  it("demotes blocked tasks", () => {
    const blocked = scoreTask(task({ status: "blocked", priority: 1 }), NOW);
    const open = scoreTask(task({ status: "todo", priority: 3 }), NOW);
    expect(blocked.score).toBeLessThan(open.score);
    expect(blocked.reasons).toContain("blocked");
  });

  it("promotes work already in progress", () => {
    const started = scoreTask(task({ status: "in_progress" }), NOW);
    const fresh = scoreTask(task({ status: "todo" }), NOW);
    expect(started.score).toBeGreaterThan(fresh.score);
  });

  it("prefers tasks that fit the available window", () => {
    const fits = scoreTask(task({ estimate_minutes: 30 }), NOW, { availableMinutes: 45 });
    const doesNot = scoreTask(task({ estimate_minutes: 240 }), NOW, { availableMinutes: 45 });
    expect(fits.score).toBeGreaterThan(doesNot.score);
    expect(doesNot.reasons).toContain("too long for now");
  });

  it("always explains itself", () => {
    const r = scoreTask(task({ priority: 1, due_at: hoursFromNow(-2) }), NOW);
    expect(r.reasons.length).toBeGreaterThan(0);
  });
});

describe("rankTasks", () => {
  it("excludes done and cancelled", () => {
    const ranked = rankTasks(
      [
        task({ title: "a", status: "done" }),
        task({ title: "b", status: "cancelled" }),
        task({ title: "c", status: "todo" }),
      ],
      NOW,
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0].task.title).toBe("c");
  });

  it("is deterministic for identical scores", () => {
    const tasks = [task({ title: "zebra" }), task({ title: "apple" })];
    const a = rankTasks(tasks, NOW).map((r) => r.task.title);
    const b = rankTasks([...tasks].reverse(), NOW).map((r) => r.task.title);
    expect(a).toEqual(b);
    expect(a[0]).toBe("apple");
  });

  it("returns an empty array for no tasks", () => {
    expect(rankTasks([], NOW)).toEqual([]);
  });
});

describe("topTasksForToday", () => {
  it("returns at most n", () => {
    const tasks = Array.from({ length: 10 }, (_, i) => task({ title: `t${i}` }));
    expect(topTasksForToday(tasks, NOW, 3)).toHaveLength(3);
  });

  it("caps a single goal at two of the top three", () => {
    const tasks = [
      task({ title: "g1-a", goal_id: "g1", priority: 1, due_at: hoursFromNow(-10) }),
      task({ title: "g1-b", goal_id: "g1", priority: 1, due_at: hoursFromNow(-9) }),
      task({ title: "g1-c", goal_id: "g1", priority: 1, due_at: hoursFromNow(-8) }),
      task({ title: "g2-a", goal_id: "g2", priority: 5 }),
    ];
    const top = topTasksForToday(tasks, NOW, 3);
    const fromG1 = top.filter((r) => r.task.goal_id === "g1").length;
    expect(fromG1).toBe(2);
    expect(top.map((r) => r.task.goal_id)).toContain("g2");
  });

  it("backfills rather than returning short when diversity cannot be met", () => {
    const tasks = [
      task({ title: "a", goal_id: "g1" }),
      task({ title: "b", goal_id: "g1" }),
      task({ title: "c", goal_id: "g1" }),
    ];
    expect(topTasksForToday(tasks, NOW, 3)).toHaveLength(3);
  });

  it("does not cap unattached tasks", () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      task({ title: `free-${i}`, goal_id: null }),
    );
    expect(topTasksForToday(tasks, NOW, 3)).toHaveLength(3);
  });
});
