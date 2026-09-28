/**
 * Demo snapshot.
 *
 * Used ONLY when Supabase is not configured, so `npm run dev` renders a real
 * dashboard on a fresh clone. It mirrors scripts/seed.ts, anchored to `now`,
 * and the UI shows a DEMO DATA badge whenever it is in use.
 *
 * This is still not a hardcoded dashboard: every number on screen is derived
 * from these raw rows by the same view model that reads Postgres. Delete this
 * file's call site once auth and the database are wired up for real.
 */

import { MODELS } from "@/lib/ai/models";
import { estimateCostCents } from "@/lib/ai/cost";
import { addDays, localDateString } from "@/lib/engine/time";
import type { Goal, Habit, Task } from "@/lib/engine/types";
import type {
  DashboardSnapshot,
  SnapshotEvent,
  SnapshotMilestone,
  SnapshotModelRun,
} from "@/lib/dashboard/snapshot";

const TZ = "America/New_York";

export function demoSnapshot(now: Date): DashboardSnapshot {
  const today = localDateString(now, TZ);
  const day = (n: number) => addDays(today, n);
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

  const goal = (g: Partial<Goal> & Pick<Goal, "id" | "title">): Goal => ({
    domain_id: null,
    metric_type: "percent",
    target_value: 100,
    current_value: 0,
    unit: "%",
    start_date: today,
    target_date: null,
    priority: 3,
    status: "active",
    ...g,
  });

  const goals: Goal[] = [
    goal({ id: "g-jarvis", title: "Ship JARVIS V1", start_date: day(-14), target_date: day(75), priority: 1 }),
    goal({ id: "g-school", title: "Fall semester at 4.0", start_date: day(-40), target_date: day(83), priority: 2 }),
    goal({ id: "g-train", title: "Train 4× a week", metric_type: "count", target_value: 56, unit: "sessions", start_date: day(-21), target_date: day(94), priority: 2 }),
    goal({ id: "g-career", title: "Land a SWE or data role", metric_type: "count", target_value: 60, unit: "applications", start_date: day(-30), target_date: day(125), priority: 2 }),
    goal({ id: "g-oracle", title: "ORACLE to beta", start_date: day(-60), target_date: day(62), priority: 3 }),
  ];

  const milestones: SnapshotMilestone[] = [
    { id: "m-1", goal_id: "g-jarvis", title: "Milestone 1: the brain", due_date: day(14), status: "active", sort_order: 0 },
    { id: "m-2", goal_id: "g-jarvis", title: "Milestone 2: auto-derivation and daily loop", due_date: day(28), status: "pending", sort_order: 1 },
    { id: "m-apps", goal_id: "g-career", title: "20 targeted applications", due_date: day(21), status: "active", sort_order: 0 },
  ];

  const task = (t: Partial<Task> & Pick<Task, "id" | "title">): Task => ({
    goal_id: null,
    project_id: null,
    milestone_id: null,
    status: "todo",
    priority: 3,
    due_at: null,
    estimate_minutes: null,
    scale: "micro",
    ...t,
  });

  const tasks: Task[] = [
    task({ id: "t-auth", title: "Build the auth flow", goal_id: "g-jarvis", milestone_id: "m-1", status: "in_progress", priority: 1, due_at: hoursAgo(-30), estimate_minutes: 120 }),
    task({ id: "t-pset", title: "DATA 101 problem set 4", goal_id: "g-school", priority: 1, due_at: hoursAgo(-20), estimate_minutes: 120 }),
    task({ id: "t-apps", title: "Five targeted applications", goal_id: "g-career", milestone_id: "m-apps", priority: 1, due_at: hoursAgo(-48), estimate_minutes: 180 }),
    task({ id: "t-ctx", title: "Context packet builder", goal_id: "g-jarvis", milestone_id: "m-1", priority: 2, due_at: hoursAgo(-56), estimate_minutes: 150 }),
    task({ id: "t-lecture", title: "DATA 101 lecture notes", goal_id: "g-school", status: "done", priority: 3, due_at: hoursAgo(3), estimate_minutes: 30 }),
    task({ id: "t-deep", title: "Deep work · auth flow", goal_id: "g-jarvis", priority: 3, due_at: hoursAgo(-2), estimate_minutes: 120 }),
    task({ id: "t-lift", title: "Upper body session", goal_id: "g-train", priority: 3, due_at: hoursAgo(-5.5), estimate_minutes: 75 }),
    task({ id: "t-feed", title: "Build the options chain ingestion job", goal_id: "g-oracle", status: "blocked", priority: 2, due_at: hoursAgo(-120), estimate_minutes: 240 }),
  ];

  const habits: Habit[] = [
    { id: "h-lift", name: "Lift or train", target_per_week: 4, active: true },
    { id: "h-leet", name: "LeetCode problem", target_per_week: 5, active: true },
    { id: "h-commit", name: "Ship a commit", target_per_week: 6, active: true },
    { id: "h-review", name: "Evening review", target_per_week: 7, active: true },
  ];

  const events: SnapshotEvent[] = [];
  let id = 1;
  const push = (e: Omit<SnapshotEvent, "id" | "xp" | "task_id"> & { xp?: number; task_id?: string | null }) =>
    events.push({ id: id++, xp: 10, task_id: null, ...e });

  // JARVIS: 24% at roughly 16% expected.
  for (const [h, q] of [[330, 6], [240, 5], [170, 4], [96, 4], [26, 3], [4, 2]] as const) {
    push({ event_type: "goal_progress", occurred_at: hoursAgo(h), goal_id: "g-jarvis", quantity: q, source: h < 30 ? "github" : "seed" });
  }
  // Commits pushed in the last day, auto-derived.
  for (let i = 0; i < 4; i++) {
    push({ event_type: "commit_pushed", occurred_at: hoursAgo(2 + i * 3), goal_id: null, quantity: 0, xp: 5, source: "github" });
  }
  push({ event_type: "task_completed", occurred_at: hoursAgo(3), goal_id: "g-school", quantity: 0, source: "github", task_id: "t-lecture" });
  push({ event_type: "task_completed", occurred_at: hoursAgo(6), goal_id: "g-jarvis", quantity: 0, source: "github" });

  // School: 44%.
  for (let i = 0; i < 8; i++) {
    push({ event_type: "goal_progress", occurred_at: hoursAgo(24 * (1 + i * 4.8)), goal_id: "g-school", quantity: 5.5, source: i < 5 ? "calendar" : "seed" });
  }
  // Training: 11 of 56 over 21 days.
  for (let i = 0; i < 11; i++) {
    push({ event_type: "workout_logged", occurred_at: hoursAgo(24 * (1 + i * 1.9)), goal_id: "g-train", quantity: 1, xp: 15, source: i % 3 === 0 ? "manual" : "calendar" });
  }
  // Applications: 11 of 60 over 30 days.
  for (let i = 0; i < 11; i++) {
    push({ event_type: "application_submitted", occurred_at: hoursAgo(24 * (2 + i * 2.5)), goal_id: "g-career", quantity: 1, xp: 20, source: "gmail" });
  }
  // ORACLE: stalled at 18%, nothing in 16 days.
  for (let i = 0; i < 3; i++) {
    push({ event_type: "goal_progress", occurred_at: hoursAgo(24 * (16 + i * 11) + 2), goal_id: "g-oracle", quantity: 6, source: "github" });
  }
  // Habits across the last 14 days.
  for (const h of habits) {
    const hits = Math.round(h.target_per_week * 2 * 0.71);
    for (let i = 0; i < hits; i++) {
      push({ event_type: "habit_done", occurred_at: hoursAgo(24 * i * (14 / hits) + 1), goal_id: null, quantity: 1, xp: 5, source: h.id === "h-commit" ? "github" : "manual" });
    }
  }
  // Focus sessions keep the streak honest.
  for (let i = 0; i < 12; i++) {
    push({ event_type: "focus_session", occurred_at: hoursAgo(24 * i + 1), goal_id: null, quantity: 1, xp: 8, source: "manual", meta: { minutes: 50 } });
  }
  // Older history so the XP total and ledger count look lived in. It starts
  // after a deliberate two-day gap, so the streak reads as the current run only.
  for (let i = 0; i < 1600; i++) {
    push({ event_type: "note_logged", occurred_at: hoursAgo(24 * (16 + (i % 200)) + (i % 7)), goal_id: null, quantity: 0, xp: i % 3 === 0 ? 1 : 0, source: i % 4 === 0 ? "manual" : "github" });
  }

  // Model runs this month. Costs come from the real price table.
  const runs: SnapshotModelRun[] = [];
  const [y, m] = today.split("-").map(Number);
  const monthStart = Date.UTC(y, m - 1, 1, 12);
  const span = Math.max(1, now.getTime() - monthStart);
  const run = (tier: "default" | "advanced" | "embedding", i: number, n: number, inp: number, cached: number, out: number) => {
    runs.push({
      model: MODELS[tier].id,
      input_tokens: inp,
      cached_input_tokens: cached,
      output_tokens: out,
      cost_cents: estimateCostCents(tier, { inputTokens: inp, cachedInputTokens: cached, outputTokens: out }),
      ok: true,
      created_at: new Date(monthStart + (span * i) / n).toISOString(),
    });
  };
  for (let i = 0; i < 480; i++) run("default", i, 480, 5_000, 3_400, 900);
  for (let i = 0; i < 20; i++) run("advanced", i, 20, 22_000, 14_000, 2_600);
  for (let i = 0; i < 40; i++) run("embedding", i, 40, 12_000, 0, 0);

  return {
    profile: {
      display_name: "Joshwa",
      timezone: TZ,
      prefs: { location: "Piscataway, NJ", school: "RUTGERS · DEC 2026", graduation_date: day(79) },
    },
    goals,
    milestones,
    tasks,
    habits,
    events,
    modelRunsThisMonth: runs,
    projectCount: 4,
    memoryCount: 47,
    preferenceCount: 9,
    jobCounts: { running: 0, queued: 0 },
    integrations: [
      { provider: "github", status: "connected" },
      { provider: "google", status: "connected" },
    ],
    isDemo: true,
  };
}
