import "server-only";
import { budgetConfig } from "@/lib/ai/cost";
import { BudgetLedger, type Llm } from "@/lib/ai/llm";
import { aiEnabled } from "@/lib/ai/flags";
import { hasOpenAIKey, makeOpenAILlm } from "@/lib/ai/openai";
import type { MemoryLine } from "@/lib/ai/context";
import type { DashboardSnapshot } from "@/lib/dashboard/snapshot";
import { applyCapturePlan } from "@/lib/db/capture";
import { loadDashboardSnapshot } from "@/lib/db/dashboard";
import { demoSnapshot } from "@/lib/db/demo";
import { loadPromptMemories } from "@/lib/db/memories";
import { modelRunRecorder } from "@/lib/db/model-runs";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient, type SupabaseServerClient } from "@/lib/supabase/server";
import { planCapture, type CapturePlan } from "./capture";
import type { CaptureSummary } from "./chat";
import { engineState, type EngineState } from "./state";

/**
 * Everything a chat or capture request needs, resolved once per request.
 *
 * Without Supabase this runs on the demo snapshot with no model: there is no
 * model_runs table to record a call in, and an unrecorded call is not allowed.
 */
export interface RequestContext {
  now: Date;
  aiEnabled: boolean;
  state: EngineState;
  memories: MemoryLine[];
  ledger: BudgetLedger;
  llm: Llm | null;
  capture: (text: string) => Promise<CaptureSummary>;
  isDemo: boolean;
}

export async function loadRequestContext(now: Date): Promise<RequestContext | "unauthorized"> {
  if (!isSupabaseConfigured()) {
    const snap = demoSnapshot(now);
    return build(now, snap, [], null, null);
  }

  const db = await createSupabaseServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return "unauthorized";

  const [snap, memories] = await Promise.all([loadDashboardSnapshot(db, user.id, now), loadPromptMemories(db)]);
  return build(now, snap, memories, db, user.id);
}

function build(
  now: Date,
  snap: DashboardSnapshot,
  memories: MemoryLine[],
  db: SupabaseServerClient | null,
  userId: string | null,
): RequestContext {
  const state = engineState(snap, now);
  const ledger = new BudgetLedger(state.spentCents, budgetConfig());
  const ai = aiEnabled();
  const llm = ai && db && userId && hasOpenAIKey() ? makeOpenAILlm({ record: modelRunRecorder(db, userId), ledger }) : null;

  const capture = async (text: string): Promise<CaptureSummary> => {
    const plan = await planCapture(text, state, llm);
    if (plan.kind === "clarify") {
      const options = plan.candidates.length ? `\n${plan.candidates.map((c) => `- ${c}`).join("\n")}` : "";
      return { outcome: "clarify", reply: plan.reply + options };
    }
    if (plan.kind === "unavailable") return { outcome: "unavailable", reply: plan.reply };

    if (!db || !userId) {
      return { outcome: "demo", reply: `Demo data: I would have ${describe(plan)}. Nothing was written.` };
    }

    const written = await applyCapturePlan(db, userId, plan, text, now);
    switch (written.outcome) {
      case "closed_task":
        return { outcome: "closed_task", reply: `Closed "${written.taskTitle}" and logged it to the ledger.` };
      case "already_done":
        return { outcome: "closed_task", reply: `"${written.taskTitle}" was already done. Nothing new logged.` };
      case "logged":
        return { outcome: "logged", reply: `Logged ${written.quantity} ${written.eventType.replace(/_/g, " ")}.` };
    }
  };

  return { now, aiEnabled: ai, state, memories, ledger, llm, capture, isDemo: db === null };
}

function describe(plan: Extract<CapturePlan, { kind: "close_task" | "log_event" }>): string {
  return plan.kind === "close_task"
    ? `closed "${plan.task.title}"`
    : `logged ${plan.quantity} ${plan.eventType.replace(/_/g, " ")}`;
}
