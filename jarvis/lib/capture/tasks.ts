/**
 * Deterministic task matching for capture.
 *
 *   exact normalized title                      -> auto
 *   one candidate > AUTO_MIN, none > SECOND_MAX -> auto
 *   otherwise candidates >= PICKER_MIN          -> picker
 *   otherwise                                   -> no match
 *
 * Thresholds live here and are pinned by tests/fixtures/captures.ts, so a
 * change shows up as a fixture diff rather than silently.
 */

import type { Task } from "@/lib/engine/types";
import { IMPERATIVES, normalize, numericTokens, stripCompletion, tokenSet } from "./text";

export const AUTO_MIN = 0.9;
export const SECOND_MAX = 0.6;
export const PICKER_MIN = 0.4;
export const PICKER_SIZE = 3;

export interface ScoredTask {
  task: Task;
  score: number;
}

export type TaskMatch =
  | { kind: "auto"; task: Task; score: number; reason: "exact" | "confident" }
  | { kind: "picker"; candidates: ScoredTask[] }
  | { kind: "no_match" };

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Token-set similarity between a capture and one title, 0 to 1.
 *
 * The title is scored both with and without its leading imperative verb and
 * the better of the two kept, so "follow up with David" still meets "followed
 * up with David" while "Build the auth flow" meets "the auth flow".
 *
 * Number guard: when both sides carry numbers and the title has one the
 * capture does not, the score is halved. "problem set 4" must not tie with
 * "problem set 3".
 */
export function titleSimilarity(captureTokens: Set<string>, title: string): number {
  const norm = normalize(title);
  const full = tokenSet(norm);
  const words = norm.split(" ");
  const stripped = IMPERATIVES.has(words[0]) && words.length > 1 ? tokenSet(words.slice(1).join(" ")) : full;

  let score = Math.max(jaccard(captureTokens, full), jaccard(captureTokens, stripped));

  const capNums = numericTokens(captureTokens);
  const titleNums = numericTokens(full);
  if (capNums.length > 0 && titleNums.some((n) => !capNums.includes(n))) score *= 0.5;

  return score;
}

export function scoreTasks(text: string, openTasks: Task[]): ScoredTask[] {
  const tokens = tokenSet(stripCompletion(normalize(text)));
  return openTasks
    .map((task) => ({ task, score: titleSimilarity(tokens, task.title) }))
    .sort((a, b) => b.score - a.score || a.task.title.localeCompare(b.task.title));
}

export function matchTask(text: string, openTasks: Task[]): TaskMatch {
  const stripped = stripCompletion(normalize(text));
  if (!stripped) return { kind: "no_match" };

  // Exact normalized title, with or without the completion words.
  const exact = openTasks.filter((t) => normalize(t.title) === stripped);
  if (exact.length === 1) return { kind: "auto", task: exact[0], score: 1, reason: "exact" };

  const ranked = scoreTasks(text, openTasks);
  const [first, second] = ranked;
  if (first && first.score > AUTO_MIN && (!second || second.score <= SECOND_MAX)) {
    return { kind: "auto", task: first.task, score: first.score, reason: "confident" };
  }

  const candidates = ranked.filter((r) => r.score >= PICKER_MIN).slice(0, PICKER_SIZE);
  return candidates.length > 0 ? { kind: "picker", candidates } : { kind: "no_match" };
}
