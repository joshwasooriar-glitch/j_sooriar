/**
 * Capture planning: free text in, a decision out. Pure and deterministic; no
 * model is involved at any point, so capture costs $0 of LLM spend and works
 * with AI off.
 *
 * A count capture ("sent 3 applications") never writes on its own: it always
 * comes back for confirmation, showing the goal, the quantity and the
 * resulting progress. A task capture writes immediately only on an exact or
 * clearly unambiguous match, and is undoable for 30 seconds.
 */

import type { Goal, Task } from "@/lib/engine/types";
import { matchCountGoals } from "./count";
import { matchTask } from "./tasks";

export interface CaptureContext {
  /** Open tasks: todo, in progress, blocked. */
  openTasks: Task[];
  /** Active count goals with their current value from the ledger. */
  countGoals: { goal: Goal; current: number }[];
}

export interface CountOption {
  goalId: string;
  goalTitle: string;
  quantity: number;
  unit: string | null;
  current: number;
  target: number | null;
  /** current + quantity. Computed here, never by a model. */
  resulting: number;
  /** resulting / target, 0 to 1, or null without a target. */
  resultingFraction: number | null;
}

export type CapturePlan =
  | { kind: "complete_task"; taskId: string; title: string; reason: "exact" | "confident" }
  | { kind: "task_picker"; question: string; options: { taskId: string; title: string; score: number }[] }
  | { kind: "confirm_count"; question: string; options: CountOption[] }
  | { kind: "no_match"; reply: string };

export function planCapture(text: string, ctx: CaptureContext): CapturePlan {
  // Counts first: "wrapped up 2 applications" is a count even though a task
  // title might share the word.
  const counts = matchCountGoals(text, ctx.countGoals.map((c) => c.goal));
  if (counts.length > 0) {
    const options = counts.map((m) => {
      const current = ctx.countGoals.find((c) => c.goal.id === m.goal.id)?.current ?? 0;
      const target = m.goal.target_value != null && Number(m.goal.target_value) > 0 ? Number(m.goal.target_value) : null;
      const resulting = current + m.quantity;
      return {
        goalId: m.goal.id,
        goalTitle: m.goal.title,
        quantity: m.quantity,
        unit: m.goal.unit,
        current,
        target,
        resulting,
        resultingFraction: target ? Math.min(1, resulting / target) : null,
      };
    });
    return {
      kind: "confirm_count",
      question: options.length === 1 ? "Log this?" : "Which goal is this for?",
      options,
    };
  }

  const m = matchTask(text, ctx.openTasks);
  switch (m.kind) {
    case "auto":
      return { kind: "complete_task", taskId: m.task.id, title: m.task.title, reason: m.reason };
    case "picker":
      return {
        kind: "task_picker",
        question: m.candidates.length === 1 ? `Did you mean "${m.candidates[0].task.title}"?` : "Which one did you finish?",
        options: m.candidates.map((c) => ({ taskId: c.task.id, title: c.task.title, score: Number(c.score.toFixed(2)) })),
      };
    case "no_match":
      return {
        kind: "no_match",
        reply:
          "I could not match that to an open task or a count goal. Name the task, or give a number with the goal's unit, like \"3 applications\".",
      };
  }
}
