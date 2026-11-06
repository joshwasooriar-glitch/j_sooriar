import { describe, expect, it } from "vitest";
import { formFields, GoalForm, goalRow, MilestoneForm, TaskForm, taskRow } from "@/lib/validation/forms";
import { isoToLocalDateTime, localDateTimeToIso } from "@/lib/validation/time";

const goal = (over: Record<string, string> = {}) => ({
  title: "Land a role",
  metric_type: "count",
  target_value: "60",
  unit: "applications",
  start_date: "2026-11-01",
  target_date: "2027-01-31",
  priority: "1",
  ...over,
});

describe("GoalForm", () => {
  it("accepts a complete count goal", () => {
    const g = GoalForm.parse(goal());
    expect(g).toMatchObject({ title: "Land a role", metric_type: "count", target_value: 60, unit: "applications", priority: 1 });
  });

  it("rejects a deadline before the start date", () => {
    const r = GoalForm.safeParse(goal({ target_date: "2026-10-01" }));
    expect(r.success).toBe(false);
  });

  it("rejects a count goal without a target or without a unit", () => {
    expect(GoalForm.safeParse(goal({ target_value: "" })).success).toBe(false);
    expect(GoalForm.safeParse(goal({ unit: "" })).success).toBe(false);
  });

  it("rejects derived or cached fields outright", () => {
    for (const key of ["current_value", "pace_status", "progress_percentage", "expected_progress"]) {
      expect(GoalForm.safeParse({ ...goal(), [key]: "50" }).success).toBe(false);
    }
  });

  it("rejects priority outside 1 to 5", () => {
    expect(GoalForm.safeParse(goal({ priority: "0" })).success).toBe(false);
    expect(GoalForm.safeParse(goal({ priority: "6" })).success).toBe(false);
  });

  it("defaults a percent goal to 100 and %", () => {
    const g = GoalForm.parse(goal({ metric_type: "percent", target_value: "", unit: "" }));
    expect(g.target_value).toBe(100);
    expect(g.unit).toBe("%");
  });

  it("never writes current_value", () => {
    const row = goalRow(GoalForm.parse(goal()), null);
    expect(Object.keys(row)).not.toContain("current_value");
  });
});

describe("formFields", () => {
  it("picks only named fields, so injected ones never reach a schema", () => {
    const fd = new FormData();
    fd.set("title", "x");
    fd.set("current_value", "99");
    fd.set("$ACTION_ID_abc", "");
    expect(formFields(fd, ["title"])).toEqual({ title: "x" });
  });
});

describe("TaskForm", () => {
  it("maps the goal prefill and converts the due time from the user's timezone", () => {
    const t = TaskForm.parse({ title: "Pset", goal_id: "00000000-0000-0000-0000-00000000a001", priority: "1", due_at: "2026-11-05T14:30" });
    const row = taskRow(t, "America/New_York");
    expect(row.goal_id).toBe("00000000-0000-0000-0000-00000000a001");
    expect(row.due_at).toBe("2026-11-05T19:30:00.000Z");
  });

  it("refuses done or cancelled as a form status: those go through their own paths", () => {
    expect(TaskForm.safeParse({ title: "x", priority: "2", status: "done" }).success).toBe(false);
    expect(TaskForm.safeParse({ title: "x", priority: "2", status: "cancelled" }).success).toBe(false);
  });

  it("rejects completed_at and other columns", () => {
    expect(TaskForm.safeParse({ title: "x", priority: "2", completed_at: "2026-11-05" }).success).toBe(false);
  });
});

describe("MilestoneForm", () => {
  it("requires the parent goal", () => {
    expect(MilestoneForm.safeParse({ title: "M1" }).success).toBe(false);
  });
});

describe("local date-time conversion", () => {
  it("handles both sides of the November DST change in New York", () => {
    expect(localDateTimeToIso("2026-10-31T09:00", "America/New_York")).toBe("2026-10-31T13:00:00.000Z"); // EDT
    expect(localDateTimeToIso("2026-11-02T09:00", "America/New_York")).toBe("2026-11-02T14:00:00.000Z"); // EST
  });

  it("round-trips for prefilling the edit form", () => {
    const iso = localDateTimeToIso("2026-11-05T14:30", "America/New_York");
    expect(isoToLocalDateTime(iso, "America/New_York")).toBe("2026-11-05T14:30");
  });
});
