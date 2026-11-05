/**
 * Task prioritization.
 *
 * Answers "what should I work on right now" deterministically, so the model
 * never has to rank anything. The model's job is to say the answer in English,
 * not to decide it.
 *
 * Pure. Time injected.
 */

import type { GoalProgress, RankedTask, Task } from "./types";

export interface RankOptions {
  /** Minutes actually available. Tasks that clearly do not fit are demoted. */
  availableMinutes?: number;
  /** Progress for each goal, keyed by goal id. Drives the behind-pace boost. */
  progressByGoal?: Map<string, GoalProgress>;
}

const HOUR = 3_600_000;

/**
 * Score a single task. Higher is more urgent.
 *
 * The weights here are deliberately legible rather than tuned. Anyone reading
 * the dashboard should be able to explain why a task rose to the top, which is
 * why every contribution also appends a reason.
 */
export function scoreTask(task: Task, now: Date, opts: RankOptions = {}): RankedTask {
  const reasons: string[] = [];
  let score = 0;

  // ---- priority ----
  const priorityPoints = (6 - clampInt(task.priority, 1, 5)) * 10;
  score += priorityPoints;
  if (task.priority <= 2) reasons.push(`priority ${task.priority}`);

  // ---- due date ----
  if (task.due_at) {
    const hoursUntil = (new Date(task.due_at).getTime() - now.getTime()) / HOUR;

    if (hoursUntil < 0) {
      const daysOver = Math.floor(-hoursUntil / 24);
      score += 60 + Math.min(40, daysOver * 5);
      reasons.push(daysOver >= 1 ? `overdue by ${daysOver}d` : "overdue");
    } else if (hoursUntil <= 24) {
      score += 45;
      reasons.push("due today");
    } else if (hoursUntil <= 72) {
      score += 25;
      reasons.push("due within 3 days");
    } else if (hoursUntil <= 168) {
      score += 10;
    }
  }

  // ---- goal pace ----
  const gp = task.goal_id ? opts.progressByGoal?.get(task.goal_id) : undefined;
  if (gp) {
    if (gp.paceStatus === "at_risk") {
      score += 35;
      reasons.push("goal at risk");
    } else if (gp.paceStatus === "behind") {
      score += 22;
      reasons.push("goal behind pace");
    } else if (gp.paceStatus === "slightly_behind") {
      score += 10;
    }
    if (gp.isOverdue) {
      score += 15;
      reasons.push("goal deadline passed");
    }
  }

  // ---- state ----
  if (task.status === "in_progress") {
    score += 18;
    reasons.push("already started");
  }
  if (task.status === "blocked") {
    score -= 50;
    reasons.push("blocked");
  }

  // ---- fit ----
  if (opts.availableMinutes != null && task.estimate_minutes != null) {
    if (task.estimate_minutes <= opts.availableMinutes) {
      score += 12;
      reasons.push("fits the window");
    } else if (task.estimate_minutes > opts.availableMinutes * 1.5) {
      score -= 20;
      reasons.push("too long for now");
    }
  }

  // Macro tasks are containers, not next actions.
  if (task.scale === "macro") score -= 8;

  return { task, score, reasons };
}

/**
 * Rank open tasks. Done and cancelled are excluded entirely.
 */
export function rankTasks(tasks: Task[], now: Date, opts: RankOptions = {}): RankedTask[] {
  return tasks
    .filter((t) => t.status !== "done" && t.status !== "cancelled")
    .map((t) => scoreTask(t, now, opts))
    .sort((a, b) => b.score - a.score || a.task.title.localeCompare(b.task.title));
}

/**
 * The day's top N, with one constraint: never surface more than two tasks from
 * the same goal. Three items from one goal is a to-do list, not a day plan, and
 * it hides whatever else is falling behind.
 */
export function topTasksForToday(
  tasks: Task[],
  now: Date,
  n = 3,
  opts: RankOptions = {},
): RankedTask[] {
  const ranked = rankTasks(tasks, now, opts);
  const out: RankedTask[] = [];
  const perGoal = new Map<string, number>();

  for (const r of ranked) {
    if (out.length >= n) break;
    const key = r.task.goal_id ?? "__none__";
    const used = perGoal.get(key) ?? 0;
    if (key !== "__none__" && used >= 2) continue;
    perGoal.set(key, used + 1);
    out.push(r);
  }

  // If the diversity rule left us short, backfill from the ranking.
  if (out.length < n) {
    for (const r of ranked) {
      if (out.length >= n) break;
      if (!out.includes(r)) out.push(r);
    }
  }

  return out;
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(v)));
}
