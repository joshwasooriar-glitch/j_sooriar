import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GOAL_STATUS_LABEL, GoalStatusForms, goalTransitions } from "@/components/goals/GoalStatusForms";
import { GoalStatus } from "@/lib/validation/forms";

const html = (status: "active" | "paused" | "completed" | "abandoned") =>
  renderToStaticMarkup(createElement(GoalStatusForms, { goalId: "g-1", status, action: async () => {} }));

describe("goal status forms (production digest 24741756)", () => {
  it("puts the target status in a hidden input inside its own form", () => {
    const out = html("active");
    const forms = out.match(/<form[\s\S]*?<\/form>/g) ?? [];
    expect(forms).toHaveLength(3);
    const statuses = forms.map((f) => /<input type="hidden" name="status" value="([a-z]+)"/.exec(f)?.[1]);
    expect(statuses).toEqual(["paused", "completed", "abandoned"]);
  });

  it("never carries the status on the button, which React does not submit", () => {
    for (const s of ["active", "paused", "completed", "abandoned"] as const) {
      expect(html(s)).not.toMatch(/<button[^>]*\bname=/);
    }
  });

  it("only ever submits values the server action accepts", () => {
    for (const s of ["active", "paused", "completed", "abandoned"] as const) {
      for (const t of goalTransitions(s)) expect(GoalStatus.safeParse(t.to).success).toBe(true);
    }
  });

  it("offers the right transitions from each state", () => {
    const to = (s: Parameters<typeof goalTransitions>[0]) => goalTransitions(s).map((t) => t.to);
    expect(to("active")).toEqual(["paused", "completed", "abandoned"]);
    expect(to("paused")).toEqual(["active", "completed", "abandoned"]);
    expect(to("completed")).toEqual(["active", "abandoned"]);
    expect(to("abandoned")).toEqual(["active", "completed"]);
  });

  it("uses one vocabulary: completed, never achieved", () => {
    expect(GOAL_STATUS_LABEL.completed).toBe("Completed");
    for (const s of ["active", "paused", "abandoned"] as const) expect(html(s)).toContain("Mark completed");
    for (const s of ["active", "paused", "completed", "abandoned"] as const) expect(html(s).toLowerCase()).not.toContain("achiev");
  });
});
