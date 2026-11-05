/**
 * Shared types for the progress engine.
 *
 * Everything in lib/engine/ is pure. No Supabase client, no fetch, no internal
 * Date.now(). Time is always passed in as `now` so tests can control it.
 */

export type MetricType = "percent" | "count" | "binary" | "value";

export type GoalStatus = "active" | "paused" | "completed" | "abandoned";

export type PaceStatus =
  | "ahead"
  | "on_track"
  | "slightly_behind"
  | "behind"
  | "at_risk"
  | "no_deadline"
  | "not_started";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "cancelled";

export interface Goal {
  id: string;
  title: string;
  domain_id: string | null;
  metric_type: MetricType;
  /** Null or 0 means the goal has no measurable target. */
  target_value: number | null;
  /** Cache of SUM(quantity) over the ledger. Recomputed nightly. */
  current_value: number;
  unit: string | null;
  /** ISO date, YYYY-MM-DD */
  start_date: string;
  /** ISO date, or null for an open-ended goal. */
  target_date: string | null;
  priority: number;
  status: GoalStatus;
}

export interface Task {
  id: string;
  title: string;
  goal_id: string | null;
  project_id: string | null;
  milestone_id: string | null;
  status: TaskStatus;
  priority: number;
  /** ISO timestamp or null. */
  due_at: string | null;
  estimate_minutes: number | null;
  scale: "macro" | "micro";
}

export interface ActivityEvent {
  id: number | string;
  event_type: string;
  /** ISO timestamp. */
  occurred_at: string;
  goal_id: string | null;
  quantity: number;
  xp: number;
  meta?: Record<string, unknown>;
}

export interface Habit {
  id: string;
  name: string;
  target_per_week: number;
  active: boolean;
}

/** Everything the engine derives about one goal. None of this is stored. */
export interface GoalProgress {
  goal_id: string;
  title: string;
  /** 0 to 1, clamped. Null when the goal has no measurable target. */
  percentComplete: number | null;
  /** 0 to 1. Where the goal should be today given elapsed time. */
  expectedProgress: number | null;
  /** percentComplete minus expectedProgress. Negative means behind. */
  paceDelta: number | null;
  paceStatus: PaceStatus;
  daysElapsed: number;
  daysRemaining: number | null;
  totalDays: number | null;
  /** Units per day needed from today to finish on time. Null if not applicable. */
  requiredDailyRate: number | null;
  /** Units per day achieved so far. */
  actualDailyRate: number | null;
  /** Projected final value at the current rate. */
  projectedFinalValue: number | null;
  /** True when projection falls short of target. */
  willMissTarget: boolean;
  remaining: number | null;
  isOverdue: boolean;
}

/**
 * The five performance components of the daily score. Review check-in is not
 * one of them: it is a consistency indicator, reported separately.
 */
export type PerformanceComponent =
  | "priority_tasks"
  | "goal_progress"
  | "habits"
  | "schedule_adherence"
  | "focus_blocks";

export type ScoreWeights = Record<PerformanceComponent, number>;

export interface ScoreBreakdown {
  /** 0 to 100, or null when fewer than MIN_MEASURED_COMPONENTS were measurable. */
  score: number | null;
  xp: number;
  /** How many performance components had something to measure today. */
  coverage: { measured: number; of: number; components: PerformanceComponent[] };
  /**
   * raw is 0 to 1, or null when there was nothing to measure. Null and zero
   * are different facts: null is "nothing scheduled", zero is "scheduled and
   * missed". weighted is null whenever the score itself is null.
   */
  components: Record<PerformanceComponent, { raw: number | null; weighted: number | null }>;
  /** Not part of the score. */
  consistency: { reviewDone: boolean };
}

export interface RankedTask {
  task: Task;
  score: number;
  reasons: string[];
}
