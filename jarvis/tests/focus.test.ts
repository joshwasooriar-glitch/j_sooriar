import { describe, expect, it } from "vitest";
import { elapsedBetween, FOCUS_CAP_MS, focusOutcome, formatElapsed } from "@/lib/focus";
import { computeDailyScore } from "@/lib/engine/score";

describe("focus timing", () => {
  it("measures elapsed time from two monotonic readings, never negative", () => {
    expect(elapsedBetween(1000, 61_000)).toBe(60_000);
    expect(elapsedBetween(5000, 4000)).toBe(0);
  });

  it("records whole minutes", () => {
    expect(focusOutcome(50 * 60_000 + 59_000)).toEqual({ kind: "record", minutes: 50, capped: false });
  });

  it("caps a session at 4 hours and flags it as left running", () => {
    expect(focusOutcome(FOCUS_CAP_MS + 1)).toEqual({ kind: "record", minutes: 240, capped: true });
    expect(focusOutcome(9 * 60 * 60_000)).toEqual({ kind: "record", minutes: 240, capped: true });
    expect(focusOutcome(FOCUS_CAP_MS)).toEqual({ kind: "record", minutes: 240, capped: false });
  });

  it("treats under a minute as a mis-click", () => {
    expect(focusOutcome(59_999)).toEqual({ kind: "too_short" });
    expect(focusOutcome(Number.NaN)).toEqual({ kind: "too_short" });
  });

  it("formats elapsed time for the button", () => {
    expect(formatElapsed(245_000)).toBe("4:05");
    expect(formatElapsed(3_729_000)).toBe("1:02:09");
  });

  it("feeds the score's focus component: one 60 minute session is half a day", () => {
    const s = computeDailyScore({
      tasksDueToday: [],
      tasksCompletedToday: [],
      eventsToday: [
        { id: 1, event_type: "focus_session", occurred_at: "2026-11-05T15:00:00Z", goal_id: null, quantity: 1, xp: 8, meta: { minutes: 60 } },
      ],
      activeHabits: [],
      activeGoalsWithDeadline: 0,
      scheduledCount: 0,
      attendedCount: 0,
      reviewDone: false,
    });
    expect(s.components.focus_blocks.raw).toBe(0.5);
  });
});
