/**
 * Dashboard view model.
 *
 * Turns a raw DashboardSnapshot into every number the command center renders.
 * Pure: no I/O, no Date.now(). All arithmetic delegates to lib/engine and
 * lib/ai/cost so there is exactly one implementation of each calculation.
 *
 * Goal values are recomputed from the ledger here rather than read from the
 * goals.current_value cache. The panel says "computed from ledger" and it has
 * to be true.
 */

import { budgetConfig, budgetState, projectMonthly, type BudgetState } from "@/lib/ai/cost";
import { MODELS, type ModelTier } from "@/lib/ai/models";
import { prioritizeActions, type PriorityAction } from "@/lib/engine/next-action";
import {
  computeGoalProgress,
  currentValueFromEvents,
} from "@/lib/engine/progress";
import { computeDailyScore, computeStreak, levelFromXp } from "@/lib/engine/score";
import { clamp, daysBetween, lastNLocalDays, localDateString } from "@/lib/engine/time";
import type { Goal, GoalProgress, PaceStatus } from "@/lib/engine/types";
import type { DashboardSnapshot, SnapshotEvent } from "./snapshot";
import { clockTime, friendlyDate, pct, relativeHours, shortDate, trimNumber } from "./format";

/** Sources that mean "JARVIS noticed this without being told". */
export const AUTO_SOURCES = new Set(["github", "calendar", "gmail"]);

/** Rows in the PRIORITY panel. */
export const PRIORITY_ROWS = 6;

export interface GoalCard {
  id: string;
  title: string;
  /** Short form for the orbit legend. */
  shortTitle: string;
  /**
   * Index into the categorical goal palette. Assigned by start date so a goal
   * keeps its color when priorities change. Color follows the entity, not rank.
   */
  colorIndex: number;
  current: number;
  target: number | null;
  unit: string | null;
  metricType: Goal["metric_type"];
  /** "24%" for percent goals, "11/56" for count goals. */
  valueLabel: string;
  percentComplete: number | null;
  expectedProgress: number | null;
  paceStatus: PaceStatus;
  paceDelta: number | null;
  daysRemaining: number | null;
  /** "DEC 12", or null for open-ended goals. */
  dueLabel: string | null;
  progress: GoalProgress;
}

export type PriorityRow =
  | {
      kind: "task";
      key: string;
      title: string;
      /** Reason chips, straight from scoreTask plus priority and estimate. */
      chips: string[];
      overdueP1: boolean;
    }
  | {
      kind: "no_next_action";
      key: string;
      goalId: string;
      title: string;
      chips: string[];
      paceStatus: PaceStatus;
    };

export interface DueTodayItem {
  id: string;
  time: string;
  title: string;
  state: "done" | "upcoming" | "overdue";
  when: string;
}

export interface RoutingRow {
  tier: ModelTier;
  modelId: string;
  pricing: string;
  role: string;
  calls: number;
  /** Share of all model calls this month, 0 to 1. */
  share: number;
  costCents: number;
}

export interface DashboardView {
  nowIso: string;
  timeZone: string;
  isDemo: boolean;
  /** JARVIS_AI_ENABLED. When false the UI says AI OFF instead of showing spend. */
  aiEnabled: boolean;
  profile: {
    name: string;
    initial: string;
    school: string | null;
    location: string | null;
    daysToGraduation: number | null;
  };
  nav: {
    goals: number;
    tasksDue: number;
    projects: number;
    memory: number;
    jobs: number;
  };
  score: {
    today: number;
    level: number;
    totalXp: number;
    streak: number;
    /** 0 to 1 progress through the current level. */
    levelProgress: number;
  };
  budget: {
    spentCents: number;
    limitCents: number;
    projectedCents: number;
    headroomCents: number;
    state: BudgetState;
    usedFraction: number;
  };
  system: {
    ledgerEvents: number;
    memories: number;
    preferences: number;
    jobsRunning: number;
    jobsQueued: number;
    linkedIntegrations: string[];
  };
  goals: GoalCard[];
  onPace: { count: number; judgeable: number; behind: number; atRisk: number };
  priority: PriorityRow[];
  overdueP1Count: number;
  dueToday: DueTodayItem[];
  signals: {
    habitConsistency: number | null;
  };
  ledger: {
    days: { date: string; count: number }[];
    total: number;
    thisWeek: number;
    /** Share of the last 14 days' events that arrived without manual logging. */
    autoDerivedShare: number | null;
    /** "4 commits closed 2 tasks", from auto-derived events in the last 24 hours. */
    autoSummary: string | null;
  };
  routing: {
    rows: RoutingRow[];
    totalCalls: number;
    /** Share of input tokens served from cache, 0 to 1. */
    cachedInputShare: number | null;
  };
  milestone: { label: string; dueLabel: string | null } | null;
}

export interface BuildOptions {
  /** Server-side JARVIS_AI_ENABLED. Defaults to off, like the flag itself. */
  aiEnabled?: boolean;
}

export function buildDashboard(snap: DashboardSnapshot, now: Date, opts: BuildOptions = {}): DashboardView {
  const tz = snap.profile.timezone || "America/New_York";
  const today = localDateString(now, tz);
  const cfg = budgetConfig();

  // ---------------- goals, from the ledger ----------------
  const activeGoals = snap.goals
    .filter((g) => g.status === "active")
    .sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));

  const colorOrder = [...activeGoals].sort(
    (a, b) => a.start_date.localeCompare(b.start_date) || a.id.localeCompare(b.id),
  );
  const colorIndex = new Map(colorOrder.map((g, idx) => [g.id, idx]));

  const goalCards: GoalCard[] = activeGoals.map((g) => {
    const current = currentValueFromEvents(g, snap.events);
    const progress = computeGoalProgress({ ...g, current_value: current }, now, tz);
    return toGoalCard(g, current, progress, colorIndex.get(g.id) ?? 0);
  });

  const progressByGoal = new Map(goalCards.map((c) => [c.id, c.progress]));

  const judgeable = goalCards.filter(
    (c) => c.paceStatus !== "no_deadline" && c.paceStatus !== "not_started",
  );
  const onPace = {
    count: judgeable.filter((c) => c.paceStatus === "on_track" || c.paceStatus === "ahead").length,
    judgeable: judgeable.length,
    behind: judgeable.filter((c) => c.paceStatus === "behind" || c.paceStatus === "slightly_behind")
      .length,
    atRisk: judgeable.filter((c) => c.paceStatus === "at_risk").length,
  };

  // ---------------- events by local day ----------------
  const eventDay = (e: SnapshotEvent) => localDateString(new Date(e.occurred_at), tz);
  const eventsToday = snap.events.filter((e) => eventDay(e) === today);

  const last14 = lastNLocalDays(now, tz, 14);
  const last14Set = new Set(last14);
  const last7Set = new Set(last14.slice(-7));
  const countsByDay = new Map<string, number>(last14.map((d) => [d, 0]));
  let recentTotal = 0;
  let recentAuto = 0;
  let thisWeek = 0;
  let habitHits = 0;

  for (const e of snap.events) {
    const d = eventDay(e);
    if (!last14Set.has(d)) continue;
    countsByDay.set(d, (countsByDay.get(d) ?? 0) + 1);
    recentTotal++;
    if (AUTO_SOURCES.has(e.source)) recentAuto++;
    if (last7Set.has(d)) thisWeek++;
    if (e.event_type === "habit_done") habitHits++;
  }

  // ---------------- tasks ----------------
  const completedTodayIds = new Set(
    eventsToday.filter((e) => e.event_type === "task_completed" && e.task_id).map((e) => e.task_id),
  );
  const tasksCompletedToday = snap.tasks.filter((t) => completedTodayIds.has(t.id));
  const dueTodayTasks = snap.tasks.filter(
    (t) => t.status !== "cancelled" && t.due_at && localDateString(new Date(t.due_at), tz) === today,
  );
  const openDueToday = dueTodayTasks.filter((t) => t.status !== "done");

  // ---------------- score ----------------
  const activeHabits = snap.habits.filter((h) => h.active);
  const daily = computeDailyScore({
    tasksDueToday: dueTodayTasks,
    tasksCompletedToday,
    eventsToday,
    activeHabits,
    // Calendar sync is Milestone 2. With nothing scheduled the component drops
    // out and its weight is redistributed, rather than scoring zero.
    scheduledCount: 0,
    attendedCount: 0,
    reviewDone: eventsToday.some((e) => e.event_type === "review_completed"),
  });
  const totalXp = snap.events.reduce((s, e) => s + (Number(e.xp) || 0), 0);
  const level = levelFromXp(totalXp);

  // ---------------- budget ----------------
  const spentCents = snap.modelRunsThisMonth.reduce((s, r) => s + (Number(r.cost_cents) || 0), 0);
  const [y, m, d] = today.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const projectedCents = projectMonthly(spentCents, d, daysInMonth);
  const budget = {
    spentCents,
    limitCents: cfg.monthlyCents,
    projectedCents,
    headroomCents: Math.max(0, cfg.monthlyCents - projectedCents),
    state: budgetState(spentCents, cfg),
    usedFraction: cfg.monthlyCents > 0 ? clamp(spentCents / cfg.monthlyCents, 0, 1) : 0,
  };

  // ---------------- priority ----------------
  const actions = prioritizeActions(
    snap.tasks,
    goalCards.map((c) => c.progress),
    now,
    PRIORITY_ROWS,
    { progressByGoal },
  );
  const priority = actions.map((a) => toPriorityRow(a, goalCards));

  // ---------------- auto-derived, last 24 hours ----------------
  const autoSummary = summarizeAuto(
    snap.events.filter(
      (e) => AUTO_SOURCES.has(e.source) && now.getTime() - new Date(e.occurred_at).getTime() <= 86_400_000,
    ),
  );

  // ---------------- due today ----------------
  const dueToday: DueTodayItem[] = [...dueTodayTasks]
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())
    .map((t) => {
      const due = new Date(t.due_at!);
      const state: DueTodayItem["state"] =
        t.status === "done" ? "done" : due.getTime() < now.getTime() ? "overdue" : "upcoming";
      return {
        id: t.id,
        time: clockTime(due, tz),
        title: t.title,
        state,
        when: state === "done" ? "done" : relativeHours(due, now),
      };
    });

  // ---------------- signals ----------------
  const habitExpected = activeHabits.reduce((s, h) => s + h.target_per_week * 2, 0);
  const habitConsistency = habitExpected > 0 ? clamp(habitHits / habitExpected, 0, 1) : null;

  // ---------------- routing ----------------
  const routing = buildRouting(snap);

  // ---------------- milestone ----------------
  const milestone = currentMilestone(snap, activeGoals);

  // ---------------- profile ----------------
  const grad = snap.profile.prefs.graduation_date;
  const name = snap.profile.display_name || "You";

  return {
    nowIso: now.toISOString(),
    timeZone: tz,
    isDemo: snap.isDemo,
    aiEnabled: opts.aiEnabled ?? false,
    profile: {
      name,
      initial: name.charAt(0).toUpperCase(),
      school: snap.profile.prefs.school ?? null,
      location: snap.profile.prefs.location ?? null,
      daysToGraduation: grad ? Math.max(0, daysBetween(today, grad)) : null,
    },
    nav: {
      goals: activeGoals.length,
      tasksDue: openDueToday.length,
      projects: snap.projectCount,
      memory: snap.memoryCount,
      jobs: snap.jobCounts.running + snap.jobCounts.queued,
    },
    score: {
      today: daily.score,
      level: level.level,
      totalXp,
      streak: computeStreak(snap.events, now, tz),
      levelProgress: level.nextAt > 0 ? level.intoLevel / level.nextAt : 0,
    },
    budget,
    system: {
      ledgerEvents: snap.events.length,
      memories: snap.memoryCount,
      preferences: snap.preferenceCount,
      jobsRunning: snap.jobCounts.running,
      jobsQueued: snap.jobCounts.queued,
      linkedIntegrations: snap.integrations
        .filter((i) => i.status === "connected")
        .map((i) => (i.provider === "github" ? "GitHub" : "Google")),
    },
    goals: goalCards,
    onPace,
    priority,
    overdueP1Count: actions.filter((a) => a.kind === "task" && a.overdueP1).length,
    dueToday,
    signals: { habitConsistency },
    ledger: {
      days: last14.map((date) => ({ date, count: countsByDay.get(date) ?? 0 })),
      total: snap.events.length,
      thisWeek,
      autoDerivedShare: recentTotal > 0 ? recentAuto / recentTotal : null,
      autoSummary,
    },
    routing,
    milestone,
  };
}

// ============================================================

function toGoalCard(g: Goal, current: number, p: GoalProgress, colorIndex: number): GoalCard {
  const target = g.target_value != null && Number(g.target_value) > 0 ? Number(g.target_value) : null;
  const valueLabel =
    g.metric_type === "count" && target != null
      ? `${trimNumber(current)}/${trimNumber(target)}`
      : pct(p.percentComplete);

  return {
    id: g.id,
    title: g.title,
    shortTitle: shortenTitle(g.title),
    colorIndex,
    current,
    target,
    unit: g.unit,
    metricType: g.metric_type,
    valueLabel,
    percentComplete: p.percentComplete,
    expectedProgress: p.expectedProgress,
    paceStatus: p.paceStatus,
    paceDelta: p.paceDelta,
    daysRemaining: p.daysRemaining,
    dueLabel: g.target_date ? shortDate(g.target_date) : null,
    progress: p,
  };
}

/** "Ship JARVIS V1" to "JARVIS V1". Drops a leading verb so the orbit legend fits. */
export function shortenTitle(title: string): string {
  const verbs = ["Ship ", "Land a ", "Land ", "Finish ", "Get "];
  for (const v of verbs) {
    if (title.startsWith(v) && title.length > v.length + 3) return title.slice(v.length);
  }
  return title;
}

function toPriorityRow(a: PriorityAction, cards: GoalCard[]): PriorityRow {
  if (a.kind === "no_next_action") {
    const card = cards.find((c) => c.id === a.goal.goal_id);
    const name = card?.shortTitle ?? a.goal.title;
    return {
      kind: "no_next_action",
      key: `goal:${a.goal.goal_id}`,
      goalId: a.goal.goal_id,
      title: `${name} has no next action`,
      chips: [
        a.goal.paceStatus === "at_risk" ? "goal at risk" : "goal behind pace",
        `${pct(a.goal.percentComplete)} vs ${pct(a.goal.expectedProgress)} expected`,
      ],
      paceStatus: a.goal.paceStatus,
    };
  }

  const t = a.ranked.task;
  return {
    kind: "task",
    key: `task:${t.id}`,
    title: t.title,
    chips: [
      `P${t.priority}`,
      // scoreTask already says "priority 1"; the P chip covers it.
      ...a.ranked.reasons.filter((r) => !r.startsWith("priority")),
      ...(t.estimate_minutes != null ? [`${t.estimate_minutes} min`] : []),
    ],
    overdueP1: a.overdueP1,
  };
}

/** One line describing what auto-derivation logged, or null if nothing did. */
export function summarizeAuto(events: SnapshotEvent[]): string | null {
  if (events.length === 0) return null;
  const commits = events.filter((e) => e.event_type === "commit_pushed").length;
  const closed = events.filter((e) => e.event_type === "task_completed").length;
  const head = commits > 0 ? `${commits} commit${commits === 1 ? "" : "s"}` : `${events.length} events`;
  return closed > 0 ? `${head} closed ${closed} task${closed === 1 ? "" : "s"}` : `${head} logged for you`;
}

const ROLE: Record<ModelTier, string> = {
  default: "default",
  advanced: "gated",
  embedding: "episodic and project memory only",
};

export function buildRouting(snap: DashboardSnapshot): DashboardView["routing"] {
  const runs = snap.modelRunsThisMonth;
  const totalCalls = runs.filter((r) => !isEmbedding(r.model)).length;

  const rows: RoutingRow[] = (Object.keys(MODELS) as ModelTier[]).map((tier) => {
    const spec = MODELS[tier];
    const mine = runs.filter((r) => r.model === spec.id);
    return {
      tier,
      modelId: spec.id,
      pricing:
        tier === "embedding"
          ? `$${spec.inputPerM.toFixed(2)} per M`
          : `$${spec.inputPerM.toFixed(2)} / $${spec.outputPerM.toFixed(2)} per M`,
      role: ROLE[tier],
      calls: mine.length,
      // Embeddings are excluded from the Luna/Sol split; they are not a routing decision.
      share: tier === "embedding" || totalCalls === 0 ? 0 : mine.length / totalCalls,
      costCents: mine.reduce((s, r) => s + (Number(r.cost_cents) || 0), 0),
    };
  });

  const chat = runs.filter((r) => !isEmbedding(r.model));
  const input = chat.reduce((s, r) => s + r.input_tokens, 0);
  const cached = chat.reduce((s, r) => s + Math.min(r.cached_input_tokens, r.input_tokens), 0);

  return { rows, totalCalls, cachedInputShare: input > 0 ? cached / input : null };
}

function isEmbedding(model: string): boolean {
  return model === MODELS.embedding.id;
}

function currentMilestone(
  snap: DashboardSnapshot,
  activeGoals: Goal[],
): DashboardView["milestone"] {
  const goalRank = new Map(activeGoals.map((g, idx) => [g.id, idx]));
  const active = snap.milestones
    .filter((m) => m.status === "active" && goalRank.has(m.goal_id))
    .sort(
      (a, b) =>
        goalRank.get(a.goal_id)! - goalRank.get(b.goal_id)! ||
        (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
    );
  const m = active[0];
  if (!m) return null;
  return {
    label: m.title.split(":")[0].trim(),
    dueLabel: m.due_date ? `Due ${friendlyDate(m.due_date)}` : null,
  };
}
