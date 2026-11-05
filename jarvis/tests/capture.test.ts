import { describe, expect, it } from "vitest";
import type { Llm } from "@/lib/ai/llm";
import { BudgetBlockedError } from "@/lib/ai/llm";
import {
  matchTaskByRules,
  numbersInText,
  planCapture,
  planFromExtraction,
  type CaptureState,
  type Extraction,
} from "@/lib/chat/capture";
import type { Goal, Task } from "@/lib/engine/types";

function task(id: string, title: string, over: Partial<Task> = {}): Task {
  return {
    id, title, goal_id: null, project_id: null, milestone_id: null, status: "todo",
    priority: 2, due_at: null, estimate_minutes: null, scale: "micro", ...over,
  };
}

const goal = (id: string, title: string, over: Partial<Goal> = {}): Goal => ({
  id, title, domain_id: null, metric_type: "count", target_value: 60, current_value: 0, unit: "applications",
  start_date: "2026-09-01", target_date: "2027-01-31", priority: 1, status: "active", ...over,
});

const STATE: CaptureState = {
  openTasks: [
    task("auth", "Build the auth flow", { goal_id: "jarvis" }),
    task("deep", "Deep work · auth flow"),
    task("pset", "DATA 101 problem set 4"),
    task("lift", "Lift"),
  ],
  activeGoals: [goal("career", "Land a SWE or data role"), goal("oracle", "ORACLE to beta", { metric_type: "percent", unit: "%" })],
};

const unreachable: Llm = async () => {
  throw new Error("model was called");
};

const ext = (over: Partial<Extraction>): Extraction => ({
  event_type: "task_completed", quantity: 1, task_match: null, goal_match: null, confidence: 0.9, note: null, ...over,
});

describe("matchTaskByRules", () => {
  it("matches the north star phrasing with no model", () => {
    expect(matchTaskByRules("I finished the auth flow.", STATE.openTasks)?.id).toBe("auth");
  });

  it("needs a completion word", () => {
    expect(matchTaskByRules("thinking about the auth flow", STATE.openTasks)).toBeNull();
  });

  it("picks the most specific title when one contains another", () => {
    expect(matchTaskByRules("finished deep work on the auth flow", STATE.openTasks)?.id).toBe("deep");
  });

  it("refuses a tie", () => {
    const tied = [task("a", "Run auth tests"), task("b", "Fix auth tests")];
    expect(matchTaskByRules("finished: run and fix auth tests", tied)).toBeNull();
  });

  it("ignores titles with fewer than two identifying words", () => {
    expect(matchTaskByRules("done lifting, finished the lift", STATE.openTasks)).toBeNull();
  });

  it("requires every identifying word, numbers included", () => {
    expect(matchTaskByRules("finished DATA 101 problem set 3", STATE.openTasks)).toBeNull();
    expect(matchTaskByRules("finished DATA 101 problem set 4", STATE.openTasks)?.id).toBe("pset");
  });
});

describe("numbersInText", () => {
  it("reads digits and small number words", () => {
    expect(numbersInText("applied to 4 jobs and two more")).toEqual([4, 2]);
  });
});

describe("planFromExtraction", () => {
  it("closes a task only when the title exactly matches an open task", () => {
    const plan = planFromExtraction(ext({ task_match: "Build the auth flow" }), "x", STATE);
    expect(plan).toMatchObject({ kind: "close_task", via: "model" });
  });

  it("asks instead of trusting an invented title", () => {
    expect(planFromExtraction(ext({ task_match: "Build the login flow" }), "x", STATE).kind).toBe("clarify");
  });

  it("asks when confidence is low", () => {
    expect(planFromExtraction(ext({ task_match: "Build the auth flow", confidence: 0.4 }), "x", STATE).kind).toBe("clarify");
  });

  it("logs a count the user actually typed", () => {
    const plan = planFromExtraction(
      ext({ event_type: "application_submitted", quantity: 4, goal_match: "Land a SWE or data role" }),
      "applied to 4 jobs today",
      STATE,
    );
    expect(plan).toEqual({ kind: "log_event", eventType: "application_submitted", goalId: "career", quantity: 4, note: null, via: "model" });
  });

  it("defaults a single count event to 1", () => {
    const plan = planFromExtraction(ext({ event_type: "workout_logged", quantity: 1 }), "hit the gym", STATE);
    expect(plan).toMatchObject({ kind: "log_event", quantity: 1 });
  });

  it("refuses a quantity the user never said", () => {
    const plan = planFromExtraction(
      ext({ event_type: "goal_progress", quantity: 15, goal_match: "ORACLE to beta" }),
      "made good progress on ORACLE",
      STATE,
    );
    expect(plan.kind).toBe("clarify");
  });

  it("refuses a goal that does not exist", () => {
    const plan = planFromExtraction(ext({ event_type: "application_submitted", goal_match: "Become an astronaut" }), "applied", STATE);
    expect(plan.kind).toBe("clarify");
  });

  it("requires a goal for goal_progress", () => {
    expect(planFromExtraction(ext({ event_type: "goal_progress", quantity: 5 }), "5 more", STATE).kind).toBe("clarify");
  });
});

describe("planCapture", () => {
  it("closes by rules with no model call", async () => {
    const plan = await planCapture("just finished the auth flow", STATE, unreachable);
    expect(plan).toMatchObject({ kind: "close_task", via: "rules" });
  });

  it("uses the model when the rules miss, and validates its answer", async () => {
    const llm: Llm = async (req) => {
      expect(req.feature).toBe("capture");
      expect(req.json).toBe(true);
      return JSON.stringify({ event_type: "task_completed", quantity: 1, task_match: "DATA 101 problem set 4", goal_match: null, confidence: 0.9, note: null });
    };
    const plan = await planCapture("submitted the pset", STATE, llm);
    expect(plan).toMatchObject({ kind: "close_task", via: "model" });
  });

  it("asks when the model returns something unreadable", async () => {
    const plan = await planCapture("submitted the pset", STATE, async () => "not json");
    expect(plan.kind).toBe("clarify");
  });

  it("reports the budget reason when the gate blocks the model", async () => {
    const llm: Llm = async () => {
      throw new BudgetBlockedError({ allowed: false, tier: "default", needsConfirmation: true, reason: "Monthly budget reached." });
    };
    const plan = await planCapture("submitted the pset", STATE, llm);
    expect(plan.kind).toBe("unavailable");
  });

  it("says what is missing when no model is configured", async () => {
    expect((await planCapture("submitted the pset", STATE, null)).kind).toBe("unavailable");
  });
});
