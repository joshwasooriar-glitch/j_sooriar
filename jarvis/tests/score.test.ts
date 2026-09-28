import { describe, expect, it } from "vitest";
import {
  computeDailyScore,
  computeStreak,
  DEFAULT_WEIGHTS,
  levelFromXp,
  type ScoreInput,
} from "../lib/engine/score";
import type { ActivityEvent, Habit, Task } from "../lib/engine/types";

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
    scheduledCount: 0,
    attendedCount: 0,
    reviewDone: false,
    ...over,
  };
}

describe("computeDailyScore", () => {
  it("scores a perfect day at or near 100", () => {
    const habits: Habit[] = [
      { id: "h1", name: "train", target_per_week: 7, active: true },
      { id: "h2", name: "commit", target_per_week: 7, active: true },
    ];
    const s = computeDailyScore(
      baseInput({
        tasksDueToday: [task({ priority: 1 }), task({ priority: 2 })],
        tasksCompletedToday: [task({ priority: 1 }), task({ priority: 2 })],
        eventsToday: [
          ev(),
          ev(),
          ev(),
          ev({ event_type: "habit_done", xp: 5 }),
          ev({ event_type: "habit_done", xp: 5 }),
          ev({ event_type: "focus_session", xp: 8, meta: { minutes: 130 } }),
        ],
        activeHabits: habits,
        scheduledCount: 2,
        attendedCount: 2,
        reviewDone: true,
      }),
    );
    expect(s.score).toBe(100);
  });

  it("scores an empty day without crashing and without punishing lack of data", () => {
    const s = computeDailyScore(baseInput());
    // Only review_checkin has anything to measure, and it is false.
    expect(s.score).toBe(0);
    expect(Number.isNaN(s.score)).toBe(false);
  });

  it("does not punish a rest day for missing habits and focus", () => {
    const habits: Habit[] = [{ id: "h1", name: "train", target_per_week: 7, active: true }];

    const normal = computeDailyScore(
      baseInput({
        tasksDueToday: [task({ priority: 1 })],
        tasksCompletedToday: [task({ priority: 1 })],
        activeHabits: habits,
        reviewDone: true,
      }),
    );
    const rest = computeDailyScore(
      baseInput({
        tasksDueToday: [task({ priority: 1 })],
        tasksCompletedToday: [task({ priority: 1 })],
        activeHabits: habits,
        reviewDone: true,
        isRestDay: true,
      }),
    );
    expect(rest.score).toBeGreaterThanOrEqual(normal.score);
    expect(rest.score).toBe(100);
  });

  it("weights a P1 completion above a P5 completion", () => {
    const high = computeDailyScore(
      baseInput({
        tasksDueToday: [task({ priority: 1 }), task({ priority: 5 })],
        tasksCompletedToday: [task({ priority: 1 })],
      }),
    );
    const low = computeDailyScore(
      baseInput({
        tasksDueToday: [task({ priority: 1 }), task({ priority: 5 })],
        tasksCompletedToday: [task({ priority: 5 })],
      }),
    );
    expect(high.components.priority_tasks.raw).toBeGreaterThan(
      low.components.priority_tasks.raw,
    );
  });

  it("treats a day with nothing due but work done as full marks on tasks", () => {
    const s = computeDailyScore(
      baseInput({ tasksCompletedToday: [task({ priority: 2 })] }),
    );
    expect(s.components.priority_tasks.raw).toBe(1);
  });

  it("sums XP from the day's events", () => {
    const s = computeDailyScore(
      baseInput({ eventsToday: [ev({ xp: 10 }), ev({ xp: 20 }), ev({ xp: 5 })] }),
    );
    expect(s.xp).toBe(35);
  });

  it("always produces a score between 0 and 100", () => {
    const s = computeDailyScore(
      baseInput({
        tasksDueToday: [task()],
        tasksCompletedToday: Array.from({ length: 50 }, () => task({ priority: 1 })),
        eventsToday: Array.from({ length: 40 }, () => ev()),
        scheduledCount: 1,
        attendedCount: 5,
        reviewDone: true,
      }),
    );
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(100);
  });

  it("respects custom weights", () => {
    const input = baseInput({
      tasksDueToday: [task({ priority: 1 })],
      tasksCompletedToday: [task({ priority: 1 })],
      reviewDone: false,
    });
    const taskHeavy = computeDailyScore(input, {
      ...DEFAULT_WEIGHTS,
      priority_tasks: 0.9,
      review_checkin: 0.1,
    });
    const reviewHeavy = computeDailyScore(input, {
      ...DEFAULT_WEIGHTS,
      priority_tasks: 0.1,
      review_checkin: 0.9,
    });
    expect(taskHeavy.score).toBeGreaterThan(reviewHeavy.score);
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
