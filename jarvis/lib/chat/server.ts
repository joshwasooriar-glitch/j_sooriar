import "server-only";
import { budgetConfig } from "@/lib/ai/cost";
import { aiEnabled } from "@/lib/ai/flags";
import { BudgetLedger, type Llm } from "@/lib/ai/llm";
import { hasOpenAIKey, makeOpenAILlm } from "@/lib/ai/openai";
import type { MemoryLine } from "@/lib/ai/context";
import { captureContext } from "@/lib/capture/context";
import type { CaptureResponse } from "@/lib/capture/protocol";
import { runCapture, type CaptureServerContext } from "@/lib/capture/server";
import type { DashboardSnapshot } from "@/lib/dashboard/snapshot";
import { loadDashboardSnapshot } from "@/lib/db/dashboard";
import { demoSnapshot } from "@/lib/db/demo";
import { loadPromptMemories } from "@/lib/db/memories";
import { modelRunRecorder } from "@/lib/db/model-runs";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient, type SupabaseServerClient } from "@/lib/supabase/server";
import { engineState, type EngineState } from "./state";

/**
 * Everything a chat or capture request needs, resolved once per request.
 *
 * Without Supabase this runs on the demo snapshot: plans are shown, nothing is
 * written, and no model is called (there is no model_runs table to record in).
 */
export interface RequestContext {
  now: Date;
  aiEnabled: boolean;
  state: EngineState;
  memories: MemoryLine[];
  ledger: BudgetLedger;
  llm: Llm | null;
  /** Free-text capture, as used by chat's progress_report intent. */
  capture: (text: string) => Promise<CaptureResponse>;
  captureServer: CaptureServerContext;
  db: SupabaseServerClient | null;
  isDemo: boolean;
}

export async function loadRequestContext(now: Date): Promise<RequestContext | "unauthorized"> {
  if (!isSupabaseConfigured()) {
    return build(now, demoSnapshot(now), [], null, null);
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
  const captureServer: CaptureServerContext = { db, capture: captureContext(snap) };

  return {
    now,
    aiEnabled: ai,
    state,
    memories,
    ledger,
    llm,
    capture: (text) => runCapture({ action: "plan", text }, captureServer),
    captureServer,
    db,
    isDemo: db === null,
  };
}
