import "server-only";
import { z } from "zod";
import type { DashboardSnapshot } from "@/lib/dashboard/snapshot";
import { localDateString, startOfLocalDay } from "@/lib/engine/time";
import type { SupabaseServerClient } from "@/lib/supabase/server";

/**
 * Loads the raw rows behind the command center.
 *
 * Every query runs as the signed-in user, so RLS scopes it. Rows are parsed
 * with Zod rather than cast: PostgREST returns numeric columns as numbers or
 * strings depending on precision, and a silent string in a sum is exactly the
 * kind of bug that makes a dashboard lie.
 */

const num = z.coerce.number();
const numOrNull = z.union([z.null(), z.coerce.number()]);

const Profile = z.object({
  display_name: z.string(),
  timezone: z.string(),
  prefs: z
    .object({
      location: z.string().optional(),
      school: z.string().optional(),
      graduation_date: z.string().optional(),
      score_weights: z.unknown().optional(),
    })
    .passthrough()
    .catch({}),
});

const GoalRow = z.object({
  id: z.string(),
  title: z.string(),
  domain_id: z.string().nullable(),
  metric_type: z.enum(["percent", "count", "binary", "value"]),
  target_value: numOrNull,
  current_value: num,
  unit: z.string().nullable(),
  start_date: z.string(),
  target_date: z.string().nullable(),
  priority: num,
  status: z.enum(["active", "paused", "completed", "abandoned"]),
});

const MilestoneRow = z.object({
  id: z.string(),
  goal_id: z.string(),
  title: z.string(),
  due_date: z.string().nullable(),
  status: z.enum(["pending", "active", "completed", "skipped"]),
  sort_order: num,
});

const TaskRow = z.object({
  id: z.string(),
  title: z.string(),
  goal_id: z.string().nullable(),
  project_id: z.string().nullable(),
  milestone_id: z.string().nullable(),
  status: z.enum(["todo", "in_progress", "blocked", "done", "cancelled"]),
  priority: num,
  due_at: z.string().nullable(),
  estimate_minutes: numOrNull,
  scale: z.enum(["macro", "micro"]),
});

const HabitRow = z.object({
  id: z.string(),
  name: z.string(),
  target_per_week: num,
  active: z.boolean(),
});

const EventRow = z.object({
  id: z.union([z.string(), z.number()]),
  event_type: z.string(),
  occurred_at: z.string(),
  goal_id: z.string().nullable(),
  task_id: z.string().nullable(),
  quantity: num,
  xp: num,
  source: z.string(),
  meta: z.record(z.unknown()).catch({}),
});

const ModelRunRow = z.object({
  model: z.string(),
  input_tokens: num,
  cached_input_tokens: num,
  output_tokens: num,
  cost_cents: num,
  ok: z.boolean(),
  created_at: z.string(),
});

const IntegrationRow = z.object({
  provider: z.enum(["google", "github"]),
  status: z.enum(["disconnected", "connected", "error", "expired"]),
});

/** PostgREST caps responses at 1000 rows by default, so the ledger is paged. */
const PAGE = 1000;

export async function loadDashboardSnapshot(
  db: SupabaseServerClient,
  userId: string,
  now: Date,
): Promise<DashboardSnapshot> {
  const profileRes = await db
    .from("profiles")
    .select("display_name, timezone, prefs")
    .eq("id", userId)
    .maybeSingle();
  if (profileRes.error) throw profileRes.error;

  const profile = profileRes.data
    ? Profile.parse(profileRes.data)
    : { display_name: "", timezone: process.env.JARVIS_TIMEZONE ?? "America/New_York", prefs: {} };

  const tz = profile.timezone;
  const [y, m] = localDateString(now, tz).split("-").map(Number);
  const monthStart = startOfLocalDay(new Date(Date.UTC(y, m - 1, 1, 12)), tz).toISOString();

  const [goals, milestones, tasks, habits, runs, integrations, projects, memories, prefs, running, queued] =
    await Promise.all([
      db.from("goals").select(
        "id, title, domain_id, metric_type, target_value, current_value, unit, start_date, target_date, priority, status",
      ),
      db.from("milestones").select("id, goal_id, title, due_date, status, sort_order"),
      db.from("tasks").select(
        "id, title, goal_id, project_id, milestone_id, status, priority, due_at, estimate_minutes, scale",
      ),
      db.from("habits").select("id, name, target_per_week, active"),
      db
        .from("model_runs")
        .select("model, input_tokens, cached_input_tokens, output_tokens, cost_cents, ok, created_at")
        .gte("created_at", monthStart),
      db.from("integrations").select("provider, status"),
      db.from("projects").select("id", { count: "exact", head: true }).neq("status", "archived"),
      db.from("memories").select("id", { count: "exact", head: true }),
      db.from("memories").select("id", { count: "exact", head: true }).eq("kind", "preference"),
      db.from("jobs").select("id", { count: "exact", head: true }).eq("status", "running"),
      db.from("jobs").select("id", { count: "exact", head: true }).eq("status", "queued"),
    ]);

  for (const r of [goals, milestones, tasks, habits, runs, integrations, projects, memories, prefs, running, queued]) {
    if (r.error) throw r.error;
  }

  const events = await loadLedger(db);

  return {
    profile,
    goals: z.array(GoalRow).parse(goals.data ?? []),
    milestones: z.array(MilestoneRow).parse(milestones.data ?? []),
    tasks: z.array(TaskRow).parse(tasks.data ?? []),
    habits: z.array(HabitRow).parse(habits.data ?? []),
    events,
    modelRunsThisMonth: z.array(ModelRunRow).parse(runs.data ?? []),
    projectCount: projects.count ?? 0,
    memoryCount: memories.count ?? 0,
    preferenceCount: prefs.count ?? 0,
    jobCounts: { running: running.count ?? 0, queued: queued.count ?? 0 },
    integrations: z.array(IntegrationRow).parse(integrations.data ?? []),
    isDemo: false,
  };
}

async function loadLedger(db: SupabaseServerClient) {
  const out: z.infer<typeof EventRow>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("activity_events")
      .select("id, event_type, occurred_at, goal_id, task_id, quantity, xp, source, meta")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = z.array(EventRow).parse(data ?? []);
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}
