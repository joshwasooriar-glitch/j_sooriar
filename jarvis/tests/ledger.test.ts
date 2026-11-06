import { describe, expect, it } from "vitest";
import { effectiveEvents, isReversed, reversedEventIds } from "@/lib/engine/ledger";
import { computeStreak } from "@/lib/engine/score";
import { currentValueFromEvents } from "@/lib/engine/progress";
import type { ActivityEvent, Goal } from "@/lib/engine/types";

const NOW = new Date("2026-11-05T17:00:00Z");

const ev = (id: number, over: Partial<ActivityEvent> = {}): ActivityEvent => ({
  id,
  event_type: "task_completed",
  occurred_at: "2026-11-05T15:00:00Z",
  goal_id: "g",
  quantity: 0,
  xp: 10,
  ...over,
});
const rev = (id: number, target: number, over: Partial<ActivityEvent> = {}): ActivityEvent =>
  ev(id, { event_type: "reversal", xp: -10, meta: { reverses_event_id: target }, ...over });

describe("effectiveEvents", () => {
  it("drops a reversed event and its reversal", () => {
    const out = effectiveEvents([ev(1), ev(2), rev(3, 1)]);
    expect(out.map((e) => e.id)).toEqual([2]);
  });

  it("matches ids across number and string forms", () => {
    expect(effectiveEvents([ev(7), rev(8, "7" as unknown as number)])).toEqual([]);
  });

  it("drops a reversal whose target is outside the loaded window", () => {
    expect(effectiveEvents([ev(2), rev(3, 999)]).map((e) => e.id)).toEqual([2]);
  });

  it("returns everything when nothing is reversed", () => {
    expect(effectiveEvents([ev(1), ev(2)])).toHaveLength(2);
  });

  it("reports which events are reversed", () => {
    const set = reversedEventIds([ev(1), rev(2, 1)]);
    expect(isReversed(ev(1), set)).toBe(true);
    expect(isReversed(ev(5), set)).toBe(false);
  });
});

describe("reversals in engine numbers", () => {
  it("a completion and its reversal add no streak day", () => {
    const day = (iso: string, id: number) => ev(id, { occurred_at: iso });
    const raw = [day("2026-11-05T15:00:00Z", 1), rev(2, 1, { occurred_at: "2026-11-05T15:00:10Z" })];
    expect(computeStreak(raw, NOW)).toBe(1); // raw rows alone look like activity
    expect(computeStreak(effectiveEvents(raw), NOW)).toBe(0);
  });

  it("a reversed quantity nets to zero in the goal value, with or without filtering", () => {
    const goal: Goal = {
      id: "g", title: "g", domain_id: null, metric_type: "count", target_value: 60, current_value: 0,
      unit: "applications", start_date: "2026-11-01", target_date: "2027-01-31", priority: 1, status: "active",
    };
    const raw = [ev(1, { event_type: "goal_progress", quantity: 4 }), rev(2, 1, { quantity: -4 })];
    expect(currentValueFromEvents(goal, raw)).toBe(0);
    expect(currentValueFromEvents(goal, effectiveEvents(raw))).toBe(0);
  });

  it("XP from a reversed pair nets to zero", () => {
    const xp = effectiveEvents([ev(1), rev(2, 1), ev(3)]).reduce((s, e) => s + e.xp, 0);
    expect(xp).toBe(10);
  });
});
