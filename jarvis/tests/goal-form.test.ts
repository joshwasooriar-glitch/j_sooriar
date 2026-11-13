import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalFields, goalFormValues } from "@/components/forms/GoalFormView";
import { GOAL_FIELDS } from "@/lib/validation/forms";

vi.mock("@/lib/supabase/session", () => ({
  // A session whose database must never be touched: validation fails first.
  requireSession: async () => ({ userId: "u", db: new Proxy({}, { get: () => { throw new Error("db touched"); } }) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirected"); } }));

afterEach(() => vi.clearAllMocks());

const TYPED: Record<string, string> = {
  title: "Keep what I typed",
  description: "Notes that must survive",
  success_definition: "Twelve sessions logged",
  domain_id: "",
  new_domain: "Fitness",
  metric_type: "count",
  target_value: "12",
  unit: "",
  start_date: "2026-11-20",
  target_date: "2026-11-10",
  priority: "2",
};

function fd(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

describe("goal actions on a validation error", () => {
  it("createGoalAction returns every field as typed, alongside the field errors", async () => {
    const { createGoalAction } = await import("@/app/goals/actions");
    const r = await createGoalAction({}, fd(TYPED));
    expect(r.errors).toMatchObject({ unit: expect.stringMatching(/unit/i), target_date: expect.stringMatching(/before the start/) });
    expect(r.values).toEqual(TYPED);
  });

  it("updateGoalAction does the same", async () => {
    const { updateGoalAction } = await import("@/app/goals/actions");
    const r = await updateGoalAction("00000000-0000-0000-0000-000000000001", {}, fd(TYPED));
    expect(r.errors?.target_date).toMatch(/before the start/);
    expect(r.values).toEqual(TYPED);
  });

  it("the form's field list matches the server's", () => {
    expect(Object.keys(goalFormValues({ start_date: "2026-01-01" })).sort()).toEqual([...GOAL_FIELDS].sort());
  });
});

describe("goal form redisplay", () => {
  const render = (val: ReturnType<typeof goalFormValues>, errors: Record<string, string>) =>
    renderToStaticMarkup(createElement(GoalFields, { val, metric: val.metric_type, onMetric: () => {}, errors, domains: [] }));

  it("submitted values win over the saved goal, including a field cleared on purpose", () => {
    const v = goalFormValues({ title: "Saved title", unit: "sessions", start_date: "2026-01-01", priority: 4 }, TYPED);
    expect(v).toEqual(TYPED);
  });

  it("renders the typed values back into the controls", () => {
    const html = render(goalFormValues({ start_date: "2026-01-01" }, TYPED), {});
    expect(html).toContain('value="Keep what I typed"');
    expect(html).toContain('value="Fitness"');
    expect(html).toContain('value="12"');
    expect(html).toContain('value="2026-11-10"');
    expect(html).toContain("Notes that must survive");
    expect(html).toMatch(/<option value="2" selected="">P2<\/option>/);
    expect(html).toMatch(/<option value="count" selected="">Count<\/option>/);
  });

  it("shows each error against its own field and marks only that control invalid", () => {
    const html = render(goalFormValues({ start_date: "2026-01-01" }, TYPED), {
      unit: "Count goals need a unit",
      target_date: "The deadline is before the start date",
    });
    expect(html).toMatch(/<input id="unit"[^>]*aria-invalid="true"[^>]*aria-describedby="unit-error"/);
    expect(html).toMatch(/<input id="target_date"[^>]*aria-invalid="true"[^>]*aria-describedby="target_date-error"/);
    expect(html).toContain('<span class="fld-error" id="unit-error" role="alert">Count goals need a unit</span>');
    expect(html).not.toMatch(/<input id="title"[^>]*aria-invalid/);
  });
});
