import { describe, expect, it } from "vitest";
import {
  computeDailyScore,
  computeStreak,
  DEFAULT_WEIGHTS,
  levelFromXp,
  MIN_MEASURED_COMPONENTS,
  resolveWeights,
  type ScoreInput,
} from "../lib/engine/score";
import type { ActivityEvent, Task } from "../lib/engine/types";

const TZ = "America/New_York";
const NOW = new Date("2026-10-15T16:00:00.000Z"); // noon ET

function task(over: Partial<Task> = {}): Task {
  return {
    id: Math.random().toString(36).slice(2),
    title: "t",
    goal_id: "g1",
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

function ev(over: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: Math.random(),
    event_type: "task_completed",
    occurred_at: NOW.toISOString(),
    goal_id: "g1",
    quantity: 1,
    xp: 10,
    ...over,
  };
}

function baseInput(over: Partial<ScoreInput> = {}): ScoreInput {
  return {
    tasksDueToday: [],
    tasksCompletedToday: [],
    eventsToday: [],
    activeHabits: [],
    activeGoalsWithDeadline: 0,
    scheduledCount: 0,
    attendedCount: 0,
    reviewDone: false,
    ...over,
  };
}

/** Two near-daily habits with one done today: habits measures 0.5. */
function halfHabits(): Pick<ScoreInput, "activeHabits" | "eventsToday"> {
  return {
    activeHabits: [
      { id: "h1", name: "lift", target_per_week: 7, active: true },
      { id: "h2", name: "read", target_per_week: 6, active: true },
    ],
    eventsToday: [ev({ event_type: "habit_done", goal_id: null, quantity: 1, xp: 5 })],
  };
}

/** One P1 task due today and completed: priority tasks measures 1.0. */
function p1DoneOnTime(): Pick<ScoreInput, "tasksDueToday" | "tasksCompletedToday"> {
  const t = task({ id: "p1", priority: 1 });
  return { tasksDueToday: [t], tasksCompletedToday: [t] };
}

describe("computeDailyScore: the seven required cases", () => {
  it("1. review-only day: no score, 0 of 5, review reported separately", () => {
    const s = computeDailyScore(baseInput({ reviewDone: true }));
    expect(s.score).toBeNull();
    expect(s.coverage).toEqual({ measured: 0, of: 5, components: [] });
    expect(s.consistency.reviewDone).toBe(true);
  });

  it("2. empty day: no score, 0 of 5, every component null rather than zero", () => {
    const s = computeDailyScore(baseInput());
    expect(s.score).toBeNull();
    expect(s.coverage.measured).toBe(0);
    for (const c of Object.values(s.components)) expect(c).toEqual({ raw: null, weighted: null });
  });

  it("3. one component: shows Score unavailable with 1 of 5, but keeps the raw value", () => {
    const s = computeDailyScore(baseInput(p1DoneOnTime()));
    expect(s.score).toBeNull();
    expect(s.coverage).toEqual({ measured: 1, of: 5, components: ["priority_tasks"] });
    expect(s.components.priority_tasks).toEqual({ raw: 1, weighted: null });
  });

  it("4. two components: a score, with weight shared between only those two", () => {
    const s = computeDailyScore(baseInput({ ...p1DoneOnTime(), ...halfHabits() }));
    // (0.35 x 1.0 + 0.15 x 0.5) / (0.35 + 0.15) = 0.85
    expect(s.score).toBe(85);
    expect(s.coverage.components).toEqual(["priority_tasks", "habits"]);
  });

  it("5. no scheduled events: schedule adherence is null, and the score is unchanged by it", () => {
    const s = computeDailyScore(baseInput({ ...p1DoneOnTime(), ...halfHabits(), scheduledCount: 0, attendedCount: 0 }));
    expect(s.components.schedule_adherence.raw).toBeNull();
    expect(s.coverage.measured).toBe(2);
    expect(s.score).toBe(85);
  });

  it("6. scheduled and missed: schedule adherence is 0, and it lowers the score", () => {
    const s = computeDailyScore(baseInput({ ...p1DoneOnTime(), ...halfHabits(), scheduledCount: 2, attendedCount: 0 }));
    expect(s.components.schedule_adherence.raw).toBe(0);
    expect(s.coverage.measured).toBe(3);
    // (0.35 + 0.075 + 0) / (0.35 + 0.15 + 0.10) = 0.708
    expect(s.score).toBe(71);
  });

  it("7. all components: 5 of 5, the hand-computed value, and the review does not move it", () => {
    const habits = halfHabits();
    const input = baseInput({
      ...p1DoneOnTime(),
      activeHabits: habits.activeHabits,
      activeGoalsWithDeadline: 1,
      scheduledCount: 2,
      attendedCount: 1,
      eventsToday: [
        ...habits.eventsToday,
        ev({ event_type: "goal_progress", quantity: 2 }),
        ev({ event_type: "goal_progress", quantity: 1 }),
        ev({ event_type: "application_submitted", quantity: 1 }),
        ev({ event_type: "focus_session", goal_id: null, quantity: 1, meta: { minutes: 60 } }),
      ],
    });
    const s = computeDailyScore(input);
    expect(s.coverage.measured).toBe(5);
    expect(s.components.goal_progress.raw).toBe(1);
    expect(s.components.schedule_adherence.raw).toBe(0.5);
    expect(s.components.focus_blocks.raw).toBe(0.5);
    // (0.35 x 1 + 0.25 x 1 + 0.15 x 0.5 + 0.10 x 0.5 + 0.10 x 0.5) / 0.95 = 0.816
    expect(s.score).toBe(82);
    expect(computeDailyScore({ ...input, reviewDone: true }).score).toBe(82);
    expect(computeDailyScore({ ...input, reviewDone: false }).score).toBe(82);
  });
});

describe("computeDailyScore: other behavior", () => {
  it("requires at least two measurable components", () => {
    expect(MIN_MEASURED_COMPONENTS).toBe(2);
  });

  it("makes habits and focus not measurable on a rest day, rather than zero", () => {
    const habits = halfHabits();
    const s = computeDailyScore(
      baseInput({ ...p1DoneOnTime(), ...habits, activeGoalsWithDeadline: 1, isRestDay: true }),
    );
    expect(s.components.habits.raw).toBeNull();
    expect(s.components.focus_blocks.raw).toBeNull();
    expect(s.coverage.measured).toBe(2);
  });

  it("weights a P1 completion above a P5 completion", () => {
    const p1 = task({ id: "a", priority: 1 });
    const p5 = task({ id: "b", priority: 5 });
    const high = computeDailyScore(baseInput({ tasksDueToday: [p1, p5], tasksCompletedToday: [p1] }));
    const low = computeDailyScore(baseInput({ tasksDueToday: [p1, p5], tasksCompletedToday: [p5] }));
    expect(high.components.priority_tasks.raw!).toBeGreaterThan(low.components.priority_tasks.raw!);
  });

  it("treats nothing due as not measurable, even when something got done", () => {
    const s = computeDailyScore(baseInput({ tasksCompletedToday: [task({ priority: 2 })] }));
    expect(s.components.priority_tasks.raw).toBeNull();
  });

  it("makes goal progress measurable only when a goal has a deadline", () => {
    const events = [ev({ event_type: "habit_done", goal_id: null })];
    expect(computeDailyScore(baseInput({ eventsToday: events })).components.goal_progress.raw).toBeNull();
    expect(
      computeDailyScore(baseInput({ eventsToday: events, activeGoalsWithDeadline: 1 })).components.goal_progress.raw,
    ).toBe(0);
  });

  it("sums XP from the day's events", () => {
    const s = computeDailyScore(baseInput({ eventsToday: [ev({ xp: 10 }), ev({ xp: 20 }), ev({ xp: 5 })] }));
    expect(s.xp).toBe(35);
  });

  it("always produces a score between 0 and 100 when it produces one", () => {
    const t = task({ id: "x", priority: 1 });
    const s = computeDailyScore(
      baseInput({
        tasksDueToday: [t],
        tasksCompletedToday: [t, ...Array.from({ length: 50 }, () => task({ priority: 1 }))],
        eventsToday: Array.from({ length: 40 }, () => ev()),
        activeGoalsWithDeadline: 3,
        scheduledCount: 1,
        attendedCount: 5,
      }),
    );
    expect(s.score).not.toBeNull();
    expect(s.score!).toBeGreaterThanOrEqual(0);
    expect(s.score!).toBeLessThanOrEqual(100);
  });

  it("respects custom weights", () => {
    const input = baseInput({ ...p1DoneOnTime(), ...halfHabits() });
    const taskHeavy = computeDailyScore(input, { ...DEFAULT_WEIGHTS, priority_tasks: 0.9, habits: 0.1 });
    const habitHeavy = computeDailyScore(input, { ...DEFAULT_WEIGHTS, priority_tasks: 0.1, habits: 0.9 });
    expect(taskHeavy.score!).toBeGreaterThan(habitHeavy.score!);
  });
});

describe("resolveWeights", () => {
  it("falls back to defaults for missing, negative or non-numeric values", () => {
    expect(resolveWeights(undefined)).toEqual(DEFAULT_WEIGHTS);
    expect(resolveWeights({ habits: -1, focus_blocks: "lots" })).toEqual(DEFAULT_WEIGHTS);
  });
  it("uses valid profile values and ignores the retired review_checkin key", () => {
    const w = resolveWeights({ priority_tasks: 0.5, review_checkin: 0.05 });
    expect(w.priority_tasks).toBe(0.5);
    expect(Object.keys(w)).not.toContain("review_checkin");
  });
});

describe("computeStreak", () => {
  function eventOn(localDate: string): ActivityEvent {
    // 3pm ET on the given local date.
    return ev({ occurred_at: `${localDate}T19:00:00.000Z` });
  }

  it("counts consecutive active days", () => {
    const events = ["2026-10-15", "2026-10-14", "2026-10-13"].map(eventOn);
    expect(computeStreak(events, NOW, TZ)).toBe(3);
  });

  it("does not break the streak when today is still empty", () => {
    const events = ["2026-10-14", "2026-10-13", "2026-10-12"].map(eventOn);
    expect(computeStreak(events, NOW, TZ)).toBe(3);
  });

  it("stops at the first true gap", () => {
    const events = ["2026-10-15", "2026-10-14", "2026-10-11"].map(eventOn);
    expect(computeStreak(events, NOW, TZ)).toBe(2);
  });

  it("returns zero with no events", () => {
    expect(computeStreak([], NOW, TZ)).toBe(0);
  });

  it("assigns a late-night local event to the correct local day", () => {
    // 11:30pm ET on Oct 14 is 03:30 UTC on Oct 15. It must count as Oct 14.
    const lateNight = ev({ occurred_at: "2026-10-15T03:30:00.000Z" });
    const alsoToday = eventOn("2026-10-15");
    expect(computeStreak([lateNight, alsoToday], NOW, TZ)).toBe(2);
  });
});

describe("levelFromXp", () => {
  it("starts at level 1", () => {
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(99).level).toBe(1);
  });

  it("levels up at the threshold", () => {
    expect(levelFromXp(100).level).toBe(2);
  });

  it("increases the cost of each level", () => {
    const l2 = levelFromXp(100);
    const l3 = levelFromXp(100 + 115);
    expect(l3.level).toBe(3);
    expect(l3.nextAt).toBeGreaterThan(l2.nextAt);
  });

  it("handles negative input safely", () => {
    expect(levelFromXp(-50).level).toBe(1);
  });
});
