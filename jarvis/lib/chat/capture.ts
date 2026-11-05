/**
 * Capture: turn "I finished the auth flow" into a ledger write.
 *
 * Order of attempts, cheapest first:
 *   1. Rules. If the text names exactly one open task and says it is done,
 *      close it with no model call at all.
 *   2. Luna extraction with CAPTURE_PROMPT, then strict validation. The model
 *      proposes; this file decides. A title it returns must exactly match an
 *      open task or active goal, and a quantity must appear in what the user
 *      typed. A model never invents a number that lands in the ledger.
 *   3. Otherwise ask. A wrong association silently corrupts progress, which is
 *      worse than one clarifying question.
 *
 * Pure apart from the injected Llm. Writing the plan is lib/db/capture.ts.
 */

import { z } from "zod";
import { CAPTURE_PROMPT } from "@/lib/ai/prompts";
import { BudgetBlockedError, type Llm } from "@/lib/ai/llm";
import type { Goal, Task } from "@/lib/engine/types";

export type CaptureEventType =
  | "task_completed"
  | "application_submitted"
  | "workout_logged"
  | "goal_progress"
  | "habit_done"
  | "note_logged";

/** XP is fixed per event type. Deterministic, never model-chosen. */
export const XP_BY_EVENT: Record<CaptureEventType, number> = {
  task_completed: 10,
  application_submitted: 20,
  workout_logged: 15,
  goal_progress: 10,
  habit_done: 5,
  note_logged: 0,
};

export type CapturePlan =
  | { kind: "close_task"; task: Task; via: "rules" | "model" }
  | {
      kind: "log_event";
      eventType: CaptureEventType;
      goalId: string | null;
      quantity: number;
      note: string | null;
      via: "model";
    }
  | { kind: "clarify"; reply: string; candidates: string[] }
  | { kind: "unavailable"; reply: string };

export interface CaptureState {
  openTasks: Task[];
  activeGoals: Goal[];
}

// ------------------------------------------------------------ rules

const COMPLETION = /\b(done|finished|finish|completed|complete|shipped|submitted|wrapped up|knocked out|closed)\b/i;

/** Words that carry no identity in a task title. "Build the auth flow" is identified by "auth flow". */
const STOP = new Set([
  "the", "a", "an", "and", "or", "to", "for", "of", "on", "in", "at", "with", "my", "our", "this", "that",
  "i", "just", "finally", "build", "write", "make", "do", "did", "get", "set", "up", "start", "finish",
  "finished", "done", "complete", "completed", "work", "task",
]);

export function significantTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t) && (t.length >= 3 || /^\d+$/.test(t)));
}

/**
 * The one open task the text says is done, or null.
 *
 * Every significant word of the title must appear in the text, the title must
 * have at least two of them, and the best match must be unique. Anything less
 * certain goes to the model or to a question.
 */
export function matchTaskByRules(text: string, openTasks: Task[]): Task | null {
  if (!COMPLETION.test(text)) return null;
  const words = new Set(significantTokens(text));

  let best: Task[] = [];
  let bestSize = 0;
  for (const t of openTasks) {
    const need = significantTokens(t.title);
    if (need.length < 2 || !need.every((w) => words.has(w))) continue;
    if (need.length > bestSize) {
      best = [t];
      bestSize = need.length;
    } else if (need.length === bestSize) {
      best.push(t);
    }
  }
  return best.length === 1 ? best[0] : null;
}

// ------------------------------------------------------------ model extraction

export const Extraction = z.object({
  event_type: z.enum([
    "task_completed",
    "application_submitted",
    "workout_logged",
    "goal_progress",
    "habit_done",
    "note",
  ]),
  quantity: z.coerce.number().finite(),
  task_match: z.string().nullable(),
  goal_match: z.string().nullable(),
  confidence: z.coerce.number().min(0).max(1),
  note: z.string().nullable().optional(),
});
export type Extraction = z.infer<typeof Extraction>;

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12,
};

/** Every number the user actually typed, as digits or as a small number word. */
export function numbersInText(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\b\d+(?:\.\d+)?\b/g)) out.push(Number(m[0]));
  for (const w of text.toLowerCase().split(/[^a-z]+/)) if (NUMBER_WORDS[w]) out.push(NUMBER_WORDS[w]);
  return out;
}

const COUNT_EVENTS = new Set<CaptureEventType>(["application_submitted", "workout_logged", "habit_done"]);

/** Turn a model's extraction into a plan, refusing anything it cannot verify. */
export function planFromExtraction(ext: Extraction, text: string, state: CaptureState): CapturePlan {
  const taskTitles = state.openTasks.map((t) => t.title);
  const clarify = (reply: string, candidates: string[] = []): CapturePlan => ({ kind: "clarify", reply, candidates });

  if (ext.confidence < 0.6) {
    return clarify("I could not tell which task or goal that was. Which one did you mean?", taskTitles.slice(0, 5));
  }

  if (ext.event_type === "task_completed") {
    const matches = state.openTasks.filter((t) => t.title === ext.task_match);
    if (matches.length !== 1) {
      return clarify("Which task did you finish?", taskTitles.slice(0, 5));
    }
    return { kind: "close_task", task: matches[0], via: "model" };
  }

  const goal = ext.goal_match ? state.activeGoals.find((g) => g.title === ext.goal_match) ?? null : null;
  if (ext.goal_match && !goal) {
    return clarify("Which goal does that count toward?", state.activeGoals.map((g) => g.title));
  }

  if (ext.event_type === "note") {
    return { kind: "log_event", eventType: "note_logged", goalId: goal?.id ?? null, quantity: 0, note: ext.note ?? text, via: "model" };
  }

  // The quantity must be one the user said. "Applied to a job" is 1 by default;
  // anything else has to be in the text, or we ask.
  const typed = numbersInText(text);
  const q = ext.quantity;
  const said = typed.includes(q);
  const defaultOne = q === 1 && COUNT_EVENTS.has(ext.event_type);
  if (!(q > 0 && q <= 1000) || !(said || defaultOne)) {
    return clarify(goal ? `How much progress on ${goal.title}, in ${goal.unit ?? "units"}?` : "How many?");
  }

  if (ext.event_type === "goal_progress" && !goal) {
    return clarify("Which goal was that progress on?", state.activeGoals.map((g) => g.title));
  }

  return { kind: "log_event", eventType: ext.event_type, goalId: goal?.id ?? null, quantity: q, note: ext.note ?? null, via: "model" };
}

/** The data the model sees: the user's own task and goal titles, and the message. */
export function captureMessage(text: string, state: CaptureState): string {
  const tasks = state.openTasks.map((t) => `- ${t.title}`).join("\n") || "(none)";
  const goals = state.activeGoals.map((g) => `- ${g.title} (${g.metric_type}${g.unit ? `, ${g.unit}` : ""})`).join("\n") || "(none)";
  return `OPEN TASKS\n${tasks}\n\nACTIVE GOALS\n${goals}\n\nMESSAGE\n${text}`;
}

// ------------------------------------------------------------ orchestration

export async function planCapture(text: string, state: CaptureState, llm: Llm | null): Promise<CapturePlan> {
  const byRules = matchTaskByRules(text, state.openTasks);
  if (byRules) return { kind: "close_task", task: byRules, via: "rules" };

  if (!llm) {
    return {
      kind: "unavailable",
      reply: "I could not match that to a task without the model, and the model is not configured. Name the task exactly, or log it on the Tasks page.",
    };
  }

  let raw: string;
  try {
    raw = await llm({
      tier: "default",
      feature: "capture",
      system: CAPTURE_PROMPT,
      messages: [{ role: "user", content: captureMessage(text, state) }],
      json: true,
      maxOutputTokens: 200,
    });
  } catch (err) {
    if (err instanceof BudgetBlockedError) {
      return { kind: "unavailable", reply: `${err.decision.reason} Name the task exactly and I can still close it without the model.` };
    }
    return { kind: "unavailable", reply: "The model call failed, so nothing was logged. Try again, or name the task exactly." };
  }

  let parsed: Extraction;
  try {
    parsed = Extraction.parse(JSON.parse(raw));
  } catch {
    return { kind: "clarify", reply: "I could not read that as a progress update. What did you finish?", candidates: [] };
  }
  return planFromExtraction(parsed, text, state);
}
