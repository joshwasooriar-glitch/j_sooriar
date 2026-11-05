/**
 * The raw rows the dashboard needs, as loaded from Postgres.
 *
 * This is the boundary between I/O (lib/db/dashboard.ts) and pure derivation
 * (lib/dashboard/view-model.ts). Nothing in here is computed. If a field could
 * be derived from other fields, it does not belong in this type.
 */

import type { ActivityEvent, Goal, Habit, Task } from "@/lib/engine/types";

export interface SnapshotProfile {
  display_name: string;
  timezone: string;
  /** Free-form prefs. Only the keys below are read by the dashboard. */
  prefs: {
    location?: string;
    school?: string;
    /** YYYY-MM-DD */
    graduation_date?: string;
    /** Per-component score weights. Validated by resolveWeights. */
    score_weights?: unknown;
  };
}

export interface SnapshotMilestone {
  id: string;
  goal_id: string;
  title: string;
  /** YYYY-MM-DD */
  due_date: string | null;
  status: "pending" | "active" | "completed" | "skipped";
  sort_order: number;
}

export interface SnapshotEvent extends ActivityEvent {
  /** manual | seed | github | calendar | gmail | jarvis */
  source: string;
  task_id: string | null;
}

export interface SnapshotModelRun {
  model: string;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  ok: boolean;
  /** ISO timestamp */
  created_at: string;
}

export interface SnapshotIntegration {
  provider: "google" | "github";
  status: "disconnected" | "connected" | "error" | "expired";
}

export interface DashboardSnapshot {
  profile: SnapshotProfile;
  goals: Goal[];
  milestones: SnapshotMilestone[];
  tasks: Task[];
  habits: Habit[];
  /** Every ledger row for the user. The ledger is the source of truth. */
  events: SnapshotEvent[];
  /** Model runs for the current calendar month only. */
  modelRunsThisMonth: SnapshotModelRun[];
  projectCount: number;
  memoryCount: number;
  preferenceCount: number;
  jobCounts: { running: number; queued: number };
  integrations: SnapshotIntegration[];
  /** True when rendered from the built-in demo fixture rather than Postgres. */
  isDemo: boolean;
}
