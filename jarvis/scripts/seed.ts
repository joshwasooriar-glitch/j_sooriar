/**
 * JARVIS seed script.
 *
 * Creates a realistic dataset so the dashboard has something to render and the
 * progress engine has something to compute against.
 *
 * Every row is marked source='seed'. Run `npm run seed:purge` to remove all of
 * it before real use. Seed data that quietly becomes production data is the
 * fastest way to make the dashboard lie.
 *
 *   npx tsx scripts/seed.ts
 */

import { createClient } from "@supabase/supabase-js";
import { assertSameKeys, withDefaults } from "./lib/batch";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = process.env.SEED_USER_ID;

if (!url || !key || !userId) {
  console.error(
    "Missing env. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_USER_ID.",
  );
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const SEED = "seed";

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 3600_000).toISOString();
}

async function main() {
  console.log("Seeding JARVIS...");

  // ---------- profile ----------
  await db.from("profiles").upsert({
    id: userId,
    display_name: "Joshwa",
    timezone: "America/New_York",
    prefs: {
      brief_time: "05:30",
      review_time: "21:00",
      weekly_launch: "MON 06:00",
      autonomy_level: 8,
      accountability_tone: "gentle_direct",
      quiet_hours: { start: "22:00", end: "04:00" },
      score_weights: {
        priority_tasks: 0.35,
        goal_progress: 0.25,
        habits: 0.15,
        schedule_adherence: 0.1,
        focus_blocks: 0.1,
      },
    },
  });

  // ---------- domains ----------
  const domainRows = [
    { name: "Business", color: "#f59e0b", sort_order: 0 },
    { name: "Career", color: "#3b82f6", sort_order: 1 },
    { name: "School", color: "#8b5cf6", sort_order: 2 },
    { name: "Coding", color: "#10b981", sort_order: 3 },
    { name: "Fitness", color: "#ef4444", sort_order: 4 },
  ].map((d) => ({ ...d, user_id: userId }));
  assertSameKeys("domains", domainRows);

  const { data: domains, error: dErr } = await db
    .from("domains")
    .upsert(domainRows, { onConflict: "user_id,name" })
    .select();
  if (dErr) throw dErr;

  const D = Object.fromEntries(domains!.map((d) => [d.name, d.id])) as Record<string, string>;
  console.log(`  ${domains!.length} domains`);

  // ---------- goals ----------
  // Deliberately mixed pace states so the engine has something to distinguish.
  const goalRows = [
    {
      title: "Ship JARVIS V1",
      description: "Personal AI operating system, deployed and in daily use.",
      success_definition:
        "Milestones 1 through 3 live at a public URL, used every morning for two weeks straight.",
      domain_id: D.Coding,
      metric_type: "percent",
      target_value: 100,
      unit: "%",
      start_date: daysFromNow(-14),
      target_date: daysFromNow(78),
      priority: 1,
    },
    {
      title: "Land a SWE or data role",
      description: "Full-time offer, target JPMorgan Chase and Wells Fargo.",
      success_definition: "Signed offer letter in hand.",
      domain_id: D.Career,
      metric_type: "count",
      target_value: 60,
      unit: "applications",
      start_date: daysFromNow(-30),
      target_date: daysFromNow(125),
      priority: 1,
    },
    {
      title: "Finish fall semester at 4.0",
      description: "DATA 101 and remaining requirements.",
      success_definition: "All finals submitted, major GPA still 4.0.",
      domain_id: D.School,
      metric_type: "percent",
      target_value: 100,
      unit: "%",
      start_date: daysFromNow(-40),
      target_date: daysFromNow(83),
      priority: 2,
    },
    {
      title: "ORACLE trading dashboard to beta",
      description: "Options trading intelligence tool under Swish Labs.",
      success_definition: "Live data feed, three working signals, one external beta user.",
      domain_id: D.Business,
      metric_type: "percent",
      target_value: 100,
      unit: "%",
      start_date: daysFromNow(-60),
      target_date: daysFromNow(94),
      priority: 3,
    },
    {
      title: "Train four times a week",
      description: "Consistency over intensity.",
      success_definition: "Sustained 4 sessions per week through December.",
      domain_id: D.Fitness,
      metric_type: "count",
      target_value: 56,
      unit: "sessions",
      start_date: daysFromNow(-21),
      target_date: daysFromNow(94),
      priority: 3,
    },
  ].map((g) => ({ ...g, user_id: userId, source: SEED }));
  assertSameKeys("goals", goalRows);

  const { data: goals, error: gErr } = await db.from("goals").insert(goalRows).select();
  if (gErr) throw gErr;
  const G = Object.fromEntries(goals!.map((g) => [g.title, g.id])) as Record<string, string>;
  console.log(`  ${goals!.length} goals`);

  // ---------- milestones ----------
  const milestoneRows = [
    { goal_id: G["Ship JARVIS V1"], title: "Milestone 1: the brain", due_date: daysFromNow(14), target_value: 25, sort_order: 0, status: "active" },
    { goal_id: G["Ship JARVIS V1"], title: "Milestone 2: auto-derivation and daily loop", due_date: daysFromNow(28), target_value: 55, sort_order: 1 },
    { goal_id: G["Ship JARVIS V1"], title: "Milestone 3: durable jobs", due_date: daysFromNow(42), target_value: 75, sort_order: 2 },
    { goal_id: G["Ship JARVIS V1"], title: "Deploy live and put URL on resume", due_date: daysFromNow(30), target_value: 60, sort_order: 3 },

    { goal_id: G["Land a SWE or data role"], title: "20 targeted applications", due_date: daysFromNow(21), target_value: 20, sort_order: 0, status: "active" },
    { goal_id: G["Land a SWE or data role"], title: "Portfolio site live with 3 case studies", due_date: daysFromNow(35), sort_order: 1 },
    { goal_id: G["Land a SWE or data role"], title: "First technical screen passed", due_date: daysFromNow(60), sort_order: 2 },

    { goal_id: G["Finish fall semester at 4.0"], title: "Midterms complete", due_date: daysFromNow(20), target_value: 50, sort_order: 0, status: "active" },
    { goal_id: G["Finish fall semester at 4.0"], title: "Finals complete", due_date: daysFromNow(83), target_value: 100, sort_order: 1 },

    { goal_id: G["ORACLE trading dashboard to beta"], title: "Live options chain feed", due_date: daysFromNow(21), target_value: 50, sort_order: 0, status: "active" },
    { goal_id: G["ORACLE trading dashboard to beta"], title: "Three signals validated on backtest", due_date: daysFromNow(56), target_value: 80, sort_order: 1 },

    { goal_id: G["Train four times a week"], title: "30 sessions logged", due_date: daysFromNow(35), target_value: 30, sort_order: 0, status: "active" },
  ].map((m) => ({ ...m, source: SEED }));
  // status is NOT NULL with a default; only some rows set it. See scripts/lib/batch.ts.
  const milestoneInsert = withDefaults("milestones", { status: "pending", target_value: null, due_date: null }, milestoneRows);

  const { data: milestones, error: mErr } = await db.from("milestones").insert(milestoneInsert).select();
  if (mErr) throw mErr;
  const M = Object.fromEntries(milestones!.map((m) => [m.title, m.id])) as Record<string, string>;
  console.log(`  ${milestones!.length} milestones`);

  // ---------- projects ----------
  const { data: projects, error: pErr } = await db
    .from("projects")
    .insert(
      withDefaults("projects", { repo_full_name: null }, [
        { name: "JARVIS", kind: "software", goal_id: G["Ship JARVIS V1"], repo_full_name: "joshwa/jarvis", stage: "building" },
        { name: "ORACLE", kind: "business", goal_id: G["ORACLE trading dashboard to beta"], repo_full_name: "joshwa/oracle", stage: "building" },
        { name: "Portfolio site", kind: "software", goal_id: G["Land a SWE or data role"], stage: "planning" },
        { name: "DATA 101", kind: "school", goal_id: G["Finish fall semester at 4.0"], stage: "in_progress" },
      ].map((p) => ({ ...p, user_id: userId, source: SEED }))),
    )
    .select();
  if (pErr) throw pErr;
  const P = Object.fromEntries(projects!.map((p) => [p.name, p.id])) as Record<string, string>;
  console.log(`  ${projects!.length} projects`);

  // ---------- habits ----------
  const { data: habits, error: hErr } = await db
    .from("habits")
    .insert(
      withDefaults("habits", {}, [
        { name: "Lift or train", target_per_week: 4, domain_id: D.Fitness },
        { name: "LeetCode problem", target_per_week: 5, domain_id: D.Career },
        { name: "Ship a commit", target_per_week: 6, domain_id: D.Coding },
        { name: "Evening review", target_per_week: 7, domain_id: D.Career },
      ].map((h) => ({ ...h, user_id: userId, source: SEED }))),
    )
    .select();
  if (hErr) throw hErr;
  console.log(`  ${habits!.length} habits`);

  // ---------- tasks ----------
  const taskRows = [
    // JARVIS, the active milestone
    { title: "Run the initial migration against local Supabase", goal_id: G["Ship JARVIS V1"], milestone_id: M["Milestone 1: the brain"], project_id: P.JARVIS, priority: 1, status: "done", completed_at: hoursAgo(50), due_at: null, estimate_minutes: 30 },
    { title: "Generate TypeScript types from the schema", goal_id: G["Ship JARVIS V1"], milestone_id: M["Milestone 1: the brain"], project_id: P.JARVIS, priority: 1, status: "done", completed_at: hoursAgo(46), estimate_minutes: 15 },
    { title: "Write progress engine unit tests", goal_id: G["Ship JARVIS V1"], milestone_id: M["Milestone 1: the brain"], project_id: P.JARVIS, priority: 1, status: "done", completed_at: hoursAgo(26), estimate_minutes: 90 },
    { title: "Build the auth flow", goal_id: G["Ship JARVIS V1"], milestone_id: M["Milestone 1: the brain"], project_id: P.JARVIS, priority: 1, status: "in_progress", due_at: hoursAgo(-8), estimate_minutes: 120 },
    { title: "Context packet builder", goal_id: G["Ship JARVIS V1"], milestone_id: M["Milestone 1: the brain"], project_id: P.JARVIS, priority: 2, due_at: hoursAgo(-32), estimate_minutes: 150 },
    { title: "Dashboard home page", goal_id: G["Ship JARVIS V1"], milestone_id: M["Milestone 1: the brain"], project_id: P.JARVIS, priority: 2, due_at: hoursAgo(-56), estimate_minutes: 180 },
    { title: "Wire /api/chat to the model router", goal_id: G["Ship JARVIS V1"], milestone_id: M["Milestone 1: the brain"], project_id: P.JARVIS, priority: 2, due_at: hoursAgo(-80), estimate_minutes: 120 },

    // Career
    { title: "Apply to JPMorgan Chase SWE new grad", goal_id: G["Land a SWE or data role"], milestone_id: M["20 targeted applications"], priority: 1, status: "done", completed_at: hoursAgo(72), estimate_minutes: 45 },
    { title: "Apply to Wells Fargo analytics new grad", goal_id: G["Land a SWE or data role"], milestone_id: M["20 targeted applications"], priority: 1, status: "done", completed_at: hoursAgo(70), estimate_minutes: 45 },
    { title: "Rewrite resume bullet points for JARVIS project", goal_id: G["Land a SWE or data role"], project_id: P["Portfolio site"], priority: 2, due_at: hoursAgo(-24), estimate_minutes: 60 },
    { title: "Five more targeted applications this week", goal_id: G["Land a SWE or data role"], milestone_id: M["20 targeted applications"], priority: 1, due_at: hoursAgo(-48), scale: "macro", estimate_minutes: 180 },
    { title: "Follow up with David Verdugo", goal_id: G["Land a SWE or data role"], priority: 2, due_at: hoursAgo(-16), estimate_minutes: 15 },

    // School
    { title: "DATA 101 problem set 4", goal_id: G["Finish fall semester at 4.0"], project_id: P["DATA 101"], milestone_id: M["Midterms complete"], priority: 1, due_at: hoursAgo(-20), estimate_minutes: 120 },
    { title: "DATA 101 problem set 3", goal_id: G["Finish fall semester at 4.0"], project_id: P["DATA 101"], priority: 2, status: "done", completed_at: hoursAgo(120), estimate_minutes: 110 },
    { title: "Study for DATA 101 midterm", goal_id: G["Finish fall semester at 4.0"], project_id: P["DATA 101"], milestone_id: M["Midterms complete"], priority: 1, due_at: hoursAgo(-96), scale: "macro", estimate_minutes: 300 },

    // ORACLE, deliberately stale so the dashboard flags it
    { title: "Pick an options data provider", goal_id: G["ORACLE trading dashboard to beta"], project_id: P.ORACLE, milestone_id: M["Live options chain feed"], priority: 2, status: "done", completed_at: hoursAgo(400), estimate_minutes: 90 },
    { title: "Build the options chain ingestion job", goal_id: G["ORACLE trading dashboard to beta"], project_id: P.ORACLE, milestone_id: M["Live options chain feed"], priority: 2, status: "blocked", notes: "Waiting on API key approval.", due_at: hoursAgo(-120), estimate_minutes: 240 },
    { title: "Backtest harness for signal validation", goal_id: G["ORACLE trading dashboard to beta"], project_id: P.ORACLE, priority: 3, due_at: hoursAgo(-240), scale: "macro", estimate_minutes: 300 },

    // Fitness
    { title: "Upper body session", goal_id: G["Train four times a week"], priority: 3, due_at: hoursAgo(-6), estimate_minutes: 75 },
  ].map((t) => ({ ...t, user_id: userId, source: SEED }));
  // status and scale are NOT NULL with defaults; only some rows set them. See scripts/lib/batch.ts.
  const taskInsert = withDefaults(
    "tasks",
    { status: "todo", scale: "micro", notes: null, due_at: null, completed_at: null, milestone_id: null, project_id: null },
    taskRows,
  );

  const { data: tasks, error: tErr } = await db.from("tasks").insert(taskInsert).select();
  if (tErr) throw tErr;
  console.log(`  ${tasks!.length} tasks`);

  // ---------- activity events ----------
  // The ledger. Everything above is scaffolding; this is what progress is computed from.
  const events: Record<string, unknown>[] = [];

  // Task completions mirror the done tasks.
  for (const t of tasks!.filter((t) => t.status === "done")) {
    events.push({
      user_id: userId,
      event_type: "task_completed",
      occurred_at: t.completed_at,
      goal_id: t.goal_id,
      milestone_id: t.milestone_id,
      project_id: t.project_id,
      task_id: t.id,
      quantity: 0,
      xp: 10,
      source: SEED,
      meta: { title: t.title },
    });
  }

  // Job applications: 11 of 60 over the last 30 days.
  for (let i = 0; i < 11; i++) {
    events.push({
      user_id: userId,
      event_type: "application_submitted",
      occurred_at: hoursAgo(24 * (2 + i * 2.4)),
      goal_id: G["Land a SWE or data role"],
      milestone_id: M["20 targeted applications"],
      quantity: 1,
      xp: 20,
      source: SEED,
      meta: { company: ["JPMorgan Chase", "Wells Fargo", "Capital One", "Bloomberg", "Vanguard"][i % 5] },
    });
  }

  // Workouts: 11 of 56 over 21 days. Slightly behind a 4-per-week pace.
  for (let i = 0; i < 11; i++) {
    events.push({
      user_id: userId,
      event_type: "workout_logged",
      occurred_at: hoursAgo(24 * (1 + i * 1.9)),
      goal_id: G["Train four times a week"],
      quantity: 1,
      xp: 15,
      source: SEED,
      meta: { kind: i % 2 === 0 ? "upper" : "lower" },
    });
  }

  // JARVIS progress: 22% of the way, roughly on pace.
  const jarvisSteps = [
    [96, 6, "Repo and architecture doc"],
    [72, 5, "Schema designed"],
    [50, 4, "Migration applied"],
    [26, 4, "Progress engine tested"],
    [8, 3, "Auth flow started"],
  ] as const;
  for (const [h, q, label] of jarvisSteps) {
    events.push({
      user_id: userId,
      event_type: "goal_progress",
      occurred_at: hoursAgo(h),
      goal_id: G["Ship JARVIS V1"],
      project_id: P.JARVIS,
      quantity: q,
      xp: 10,
      source: SEED,
      meta: { note: label },
    });
  }

  // School: 44% through the semester.
  for (let i = 0; i < 8; i++) {
    events.push({
      user_id: userId,
      event_type: "goal_progress",
      occurred_at: hoursAgo(24 * (3 + i * 4.5)),
      goal_id: G["Finish fall semester at 4.0"],
      project_id: P["DATA 101"],
      quantity: 5.5,
      xp: 10,
      source: SEED,
      meta: { note: "coursework" },
    });
  }

  // ORACLE: stalled at 18%, nothing in 16 days. This is the goal the dashboard
  // should surface as at risk.
  for (let i = 0; i < 3; i++) {
    events.push({
      user_id: userId,
      event_type: "goal_progress",
      occurred_at: hoursAgo(24 * (16 + i * 11)),
      goal_id: G["ORACLE trading dashboard to beta"],
      project_id: P.ORACLE,
      quantity: 6,
      xp: 10,
      source: SEED,
      meta: { note: "early setup" },
    });
  }

  // Habits over the last 14 days.
  for (const h of habits!) {
    const perWeek = h.target_per_week as number;
    const hits = Math.round(perWeek * 2 * 0.75);
    for (let i = 0; i < hits; i++) {
      events.push({
        user_id: userId,
        event_type: "habit_done",
        occurred_at: hoursAgo(24 * (i * (14 / hits)) + 10),
        quantity: 1,
        xp: 5,
        source: SEED,
        meta: { habit_id: h.id, habit: h.name },
      });
    }
  }

  // Focus sessions.
  for (let i = 0; i < 9; i++) {
    events.push({
      user_id: userId,
      event_type: "focus_session",
      occurred_at: hoursAgo(24 * i + 14),
      quantity: 1,
      xp: 8,
      source: SEED,
      meta: { minutes: [50, 90, 25][i % 3] },
    });
  }

  const { error: eErr, count } = await db
    .from("activity_events")
    .insert(withDefaults("activity_events", { goal_id: null, milestone_id: null, project_id: null, task_id: null, meta: {} }, events), { count: "exact" });
  if (eErr) throw eErr;
  console.log(`  ${count ?? events.length} activity events`);

  // ---------- reconcile so current_value matches the ledger ----------
  const { data: touched, error: rErr } = await db.rpc("reconcile_goal_values", {
    p_user_id: userId,
  });
  if (rErr) throw rErr;
  console.log(`  reconciled ${touched} goals`);

  // ---------- memories ----------
  const { error: memErr } = await db.from("memories").insert(
    withDefaults("memories", { entity_name: null, source_type: "stated", confidence: null }, [
      { kind: "profile", content: "Senior at Rutgers University New Brunswick, B.S. Information Technology and Data Science, graduating December 2026.", importance: 5 },
      { kind: "profile", content: "Runs Swish Labs. ORACLE is the flagship build.", importance: 4 },
      { kind: "preference", content: "Prefers plain conversational prose. No em dashes or en dashes. Clean scannable formatting with key results visually distinct.", importance: 5 },
      { kind: "preference", content: "Accountability tone: gentle by default, direct when genuinely falling behind.", importance: 4 },
      { kind: "preference", content: "Wants a morning briefing between 5 and 6am with progress, a greeting, and a motivational quote.", importance: 4 },
      { kind: "preference", content: "Voice should be masculine British, calm and concise.", importance: 3 },
      { kind: "entity", entity_name: "JPMorgan Chase", content: "Primary target employer for software engineering and data analytics roles.", importance: 4 },
      { kind: "entity", entity_name: "Wells Fargo", content: "Secondary target employer.", importance: 4 },
      { kind: "goal", content: "Hard AI budget is $10 per month. Cost efficiency is an architectural requirement, not a preference.", importance: 5 },
    ].map((m) => ({ ...m, user_id: userId, source: SEED }))),
  );
  if (memErr) throw memErr;

  console.log("\nDone. All rows marked source='seed'.");
  console.log("Purge before real use: npm run seed:purge\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
