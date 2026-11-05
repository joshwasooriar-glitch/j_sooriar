/**
 * Chat orchestration.
 *
 *   route (rules, then a Luna classify call only if rules miss)
 *     status_query / next_action -> engine answer; Luna only rephrases it,
 *                                   and the engine answer stands alone when
 *                                   the budget or the model is unavailable
 *     progress_report            -> capture
 *     everything else            -> budget gate, escalation gate, context
 *                                   packet, one model call
 *
 * Pure apart from the injected Llm and capture function, so every branch is
 * testable without a network or a database.
 */

import { z } from "zod";
import { budgetConfig } from "@/lib/ai/cost";
import { buildContextPacket, deterministicStatusAnswer, type MemoryLine } from "@/lib/ai/context";
import { BudgetBlockedError, type BudgetLedger, type Llm } from "@/lib/ai/llm";
import type { ModelTier } from "@/lib/ai/models";
import { SYSTEM_PROMPT, VOICE_SUFFIX } from "@/lib/ai/prompts";
import {
  CLASSIFY_PROMPT,
  isDeterministic,
  mayEscalate,
  routeByRules,
  tierForIntent,
  type Intent,
} from "@/lib/ai/router";
import { deterministicNextAction, type EngineState } from "./state";

export const ChatRequest = z.object({
  message: z.string().trim().min(1).max(2000),
  voice: z.boolean().optional(),
  /** Set when the user confirmed an advanced-model call the gate asked about. */
  confirmAdvanced: z.boolean().optional(),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

export type ChatStatus = "ok" | "needs_confirmation" | "budget_blocked" | "unavailable";

export interface ChatResponse {
  reply: string;
  intent: Intent;
  routedBy: "rules" | "model" | "fallback";
  /** True when the reply came from the engine with no model call. */
  deterministic: boolean;
  status: ChatStatus;
  tier: ModelTier | null;
  /** Present when capture ran. */
  capture?: CaptureSummary;
}

export interface CaptureSummary {
  outcome: "closed_task" | "logged" | "clarify" | "unavailable" | "demo";
  reply: string;
}

export interface ChatDeps {
  now: Date;
  state: EngineState;
  memories: MemoryLine[];
  ledger: BudgetLedger;
  /** Null when no key is configured or there is no database to record runs in. */
  llm: Llm | null;
  capture: (text: string) => Promise<CaptureSummary>;
}

const IntentName = z.enum([
  "status_query", "next_action", "progress_report", "task_management", "goal_management", "calendar",
  "memory", "simple_question", "research", "deep_research", "coding", "planning", "conversation",
]);

export async function handleChat(req: ChatRequest, deps: ChatDeps): Promise<ChatResponse> {
  const { intent, routedBy } = await classify(req.message, deps);

  // ---- engine-first intents ----
  if (isDeterministic(intent)) {
    const engineAnswer =
      intent === "status_query"
        ? deterministicStatusAnswer(deps.state.progress, deps.state.worst)
        : deterministicNextAction(deps.state.topTasks);

    const base = { intent, routedBy, status: "ok" as const };

    // The model only phrases numbers the engine already computed. When it is
    // unavailable or the budget says no, the engine answer is the answer.
    if (!deps.llm || !deps.ledger.check("default").allowed) {
      return { ...base, reply: engineAnswer, deterministic: true, tier: null };
    }
    try {
      const reply = await callModel(req, intent, "default", deps);
      return { ...base, reply, deterministic: false, tier: "default" };
    } catch {
      return { ...base, reply: engineAnswer, deterministic: true, tier: null };
    }
  }

  // ---- capture ----
  if (intent === "progress_report") {
    const capture = await deps.capture(req.message);
    return {
      reply: capture.reply,
      intent,
      routedBy,
      deterministic: true,
      status: capture.outcome === "unavailable" ? "unavailable" : "ok",
      tier: null,
      capture,
    };
  }

  // ---- model intents ----
  const requested = tierForIntent(intent);
  const decision = deps.ledger.check(requested);
  const base = { intent, routedBy, deterministic: false };

  if (!decision.allowed) {
    return { ...base, reply: decision.reason, status: "budget_blocked", tier: null };
  }
  if (decision.needsConfirmation && !req.confirmAdvanced) {
    return { ...base, reply: decision.reason, status: "needs_confirmation", tier: null };
  }

  let tier = decision.tier;
  if (tier === "advanced") {
    // ARCHITECTURE section 7. No retrieval layer or research cache exists yet
    // in Milestone 1, so those two checks cannot rule escalation out.
    const esc = mayEscalate({
      canAnswerDeterministically: false,
      retrievalFitsDefaultModel: false,
      hasCachedResearch: false,
      budgetAllowsAdvanced: true,
    });
    if (!esc.ok) tier = "default";
  }

  if (!deps.llm) {
    return {
      ...base,
      reply: "The model is not configured, so I can only answer status and next-action questions right now.",
      status: "unavailable",
      tier: null,
    };
  }

  try {
    const reply = await callModel(req, intent, tier, deps);
    return { ...base, reply, status: "ok", tier };
  } catch (err) {
    if (err instanceof BudgetBlockedError) {
      return { ...base, reply: err.decision.reason, status: "budget_blocked", tier: null };
    }
    return { ...base, reply: "The model call failed. Nothing was changed.", status: "unavailable", tier: null };
  }
}

async function classify(
  message: string,
  deps: ChatDeps,
): Promise<{ intent: Intent; routedBy: ChatResponse["routedBy"] }> {
  const byRules = routeByRules(message);
  if (byRules) return { intent: byRules.intent, routedBy: "rules" };

  if (!deps.llm || !deps.ledger.check("default").allowed) {
    return { intent: "conversation", routedBy: "fallback" };
  }
  try {
    const raw = await deps.llm({
      tier: "default",
      feature: "classify",
      system: CLASSIFY_PROMPT,
      messages: [{ role: "user", content: message }],
      maxOutputTokens: 8,
    });
    const parsed = IntentName.safeParse(raw.trim().toLowerCase().replace(/[^a-z_]/g, ""));
    return parsed.success
      ? { intent: parsed.data, routedBy: "model" }
      : { intent: "conversation", routedBy: "fallback" };
  } catch {
    return { intent: "conversation", routedBy: "fallback" };
  }
}

async function callModel(req: ChatRequest, intent: Intent, tier: ModelTier, deps: ChatDeps): Promise<string> {
  const s = deps.state;
  const packet = buildContextPacket({
    now: deps.now,
    timeZone: s.timeZone,
    displayName: s.displayName,
    intent,
    progress: s.progress,
    topTasks: s.topTasks,
    openTaskCount: s.openTasks.length,
    overdueTaskCount: s.overdueCount,
    recentEvents: s.recentEvents,
    memories: deps.memories,
    calendar: [],
    streak: s.streak,
    todayScore: s.todayScore,
    spentCents: deps.ledger.spentCents,
    budgetCents: budgetConfig().monthlyCents,
  });

  return deps.llm!({
    tier,
    feature: "chat",
    // Stable prefix first so it caches. VOICE_SUFFIX is a fixed string, so the
    // voice variant caches too.
    system: req.voice ? SYSTEM_PROMPT + VOICE_SUFFIX : SYSTEM_PROMPT,
    messages: [
      { role: "user", content: `CONTEXT\n${packet.text}` },
      { role: "user", content: req.message },
    ],
    maxOutputTokens: tier === "advanced" ? 1500 : 600,
  });
}
