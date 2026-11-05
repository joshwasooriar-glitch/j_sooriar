import { describe, expect, it } from "vitest";
import { quantities } from "@/lib/capture/count";
import { planCapture, type CapturePlan } from "@/lib/capture/plan";
import { matchTask } from "@/lib/capture/tasks";
import { normalize, stem, stripCompletion } from "@/lib/capture/text";
import { CAPTURE_CASES, COUNT_GOALS, OPEN_TASKS, type Expected } from "./fixtures/captures";

const ctx = { openTasks: OPEN_TASKS, countGoals: COUNT_GOALS };

function summarize(p: CapturePlan): Expected {
  switch (p.kind) {
    case "complete_task":
      return { kind: "complete_task", taskId: p.taskId, reason: p.reason };
    case "task_picker":
      return { kind: "task_picker", taskIds: p.options.map((o) => o.taskId).sort() };
    case "confirm_count":
      return { kind: "confirm_count", options: p.options.map((o) => ({ goalId: o.goalId, quantity: o.quantity })) };
    case "no_match":
      return { kind: "no_match" };
  }
}

describe("capture fixture", () => {
  it.each(CAPTURE_CASES)("$text", ({ text, expect: want }) => {
    const got = summarize(planCapture(text, ctx));
    if (want.kind === "complete_task" && !want.reason) {
      expect(got).toMatchObject({ kind: "complete_task", taskId: want.taskId });
    } else if (want.kind === "task_picker") {
      expect(got).toEqual({ kind: "task_picker", taskIds: [...want.taskIds].sort() });
    } else {
      expect(got).toEqual(want);
    }
  });

  it("has a realistic number of cases", () => {
    expect(CAPTURE_CASES.length).toBeGreaterThanOrEqual(15);
  });
});

describe("text rules", () => {
  it("normalizes case, punctuation and apostrophes", () => {
    expect(normalize("  I've   FINISHED: the Auth-Flow!! ")).toBe("ive finished the auth flow");
  });

  it("strips completion language, multi-word phrases included", () => {
    expect(stripCompletion("just wrapped up the auth flow")).toBe("the auth flow");
    expect(stripCompletion("completed and done")).toBe("and");
  });

  it("stems consistently on both sides", () => {
    expect(stem("bullets")).toBe("bullet");
    expect(stem("followed")).toBe("follow");
    expect(stem("applications")).toBe("application");
    expect(stem("101")).toBe("101");
  });
});

describe("quantities", () => {
  it("ignores years, dates, times, ordinals and numbers after in/on/by", () => {
    expect(quantities("3 applications in 2026, due by 5, on 12, at 3:30 on 11/5, the 3rd time, 1234")).toEqual([3]);
  });
  it("reads number words", () => {
    expect(quantities("two sessions and twelve pages")).toEqual([2, 12]);
  });
  it("does not treat a or an as a quantity", () => {
    expect(quantities("did an upper body session")).toEqual([]);
  });
});

describe("count confirmation", () => {
  it("shows the goal, the quantity and the resulting progress before any write", () => {
    const p = planCapture("sent 3 applications", ctx);
    expect(p).toEqual({
      kind: "confirm_count",
      question: "Log this?",
      options: [
        {
          goalId: "career",
          goalTitle: "Land a SWE or data role",
          quantity: 3,
          unit: "applications",
          current: 11,
          target: 60,
          resulting: 14,
          resultingFraction: 14 / 60,
        },
      ],
    });
  });

  it("never matches a percent goal on a quantity", () => {
    expect(planCapture("finished 10 %", ctx).kind).not.toBe("confirm_count");
  });
});

describe("task matching edges", () => {
  it("never offers done or cancelled tasks, because callers pass open tasks only", () => {
    expect(matchTask("finished the auth flow", []).kind).toBe("no_match");
  });

  it("does not auto-complete when two tasks share an exact title", () => {
    const dupes = [OPEN_TASKS[0], { ...OPEN_TASKS[0], id: "auth-2" }];
    expect(matchTask("build the auth flow", dupes).kind).toBe("picker");
  });
});
