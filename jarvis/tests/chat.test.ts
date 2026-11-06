import { describe, expect, it } from "vitest";
import { deterministicStatusAnswer } from "@/lib/ai/context";
import type { BudgetConfig } from "@/lib/ai/cost";
import { BudgetLedger, type Llm, type LlmRequest } from "@/lib/ai/llm";
import type { CaptureResponse } from "@/lib/capture/protocol";
import { handleChat, type ChatDeps } from "@/lib/chat/chat";
import { deterministicNextAction, engineState } from "@/lib/chat/state";
import { demoSnapshot } from "@/lib/db/demo";

const NOW = new Date("2026-11-05T16:00:00Z");
const CFG: BudgetConfig = { monthlyCents: 1000, warnCents: 700, restrictCents: 850, hardStopCents: 950 };

/** A model that must not be reached. If it is, the test fails on the thrown error. */
const unreachable: Llm = async (req) => {
  throw new Error(`model was called for ${req.feature}`);
};

/** A model that answers, and remembers what it was asked so tests can inspect the request. */
function answering(reply = "model reply") {
  const calls: LlmRequest[] = [];
  const llm: Llm = async (req) => {
    calls.push(req);
    return req.feature === "classify" ? "planning" : reply;
  };
  return { llm, calls };
}

function deps(over: Partial<ChatDeps> & { spent?: number } = {}): ChatDeps {
  const state = engineState(demoSnapshot(NOW), NOW);
  return {
    now: NOW,
    aiEnabled: true,
    state,
    memories: [],
    ledger: new BudgetLedger(over.spent ?? 100, CFG),
    llm: null,
    capture: async (): Promise<CaptureResponse> => ({
      kind: "completed",
      reply: "closed it",
      eventId: 1,
      undoUntil: "2026-11-05T16:00:30Z",
    }),
    ...over,
  };
}

const STATUS = "Hi, how are we doing in terms of progress towards the goals?";

describe("handleChat: status_query", () => {
  it("answers from the engine alone at hard_stop, with no model call", async () => {
    const d = deps({ spent: 1000, llm: unreachable });
    const res = await handleChat({ message: STATUS }, d);
    expect(res.intent).toBe("status_query");
    expect(res.deterministic).toBe(true);
    expect(res.status).toBe("ok");
    expect(res.reply).toBe(deterministicStatusAnswer(d.state.progress, d.state.worst));
  });

  it("names every active goal and the furthest behind", async () => {
    const d = deps({ spent: 1000, llm: unreachable });
    const res = await handleChat({ message: STATUS }, d);
    for (const g of d.state.activeGoals) expect(res.reply).toContain(g.title);
    expect(res.reply).toContain(`Furthest behind: ${d.state.worst!.title}.`);
  });

  it("answers from the engine when no model is configured", async () => {
    const res = await handleChat({ message: STATUS }, deps({ llm: null }));
    expect(res.deterministic).toBe(true);
  });

  it("lets Luna phrase it when the budget allows, with the engine numbers in context", async () => {
    const { llm, calls } = answering("You are mostly on track.");
    const res = await handleChat({ message: STATUS }, deps({ llm }));
    expect(res.reply).toBe("You are mostly on track.");
    expect(res.tier).toBe("default");
    expect(calls).toHaveLength(1);
    expect(calls[0].feature).toBe("chat");
    expect(calls[0].messages[0].content).toContain("ACTIVE GOALS");
  });

  it("falls back to the engine answer when the model call fails", async () => {
    const d = deps({ llm: async () => { throw new Error("timeout"); } });
    const res = await handleChat({ message: STATUS }, d);
    expect(res.deterministic).toBe(true);
    expect(res.reply).toBe(deterministicStatusAnswer(d.state.progress, d.state.worst));
  });
});

describe("handleChat: next_action", () => {
  it("answers from the engine alone at hard_stop", async () => {
    const d = deps({ spent: 1000, llm: unreachable });
    const res = await handleChat({ message: "what should I work on?" }, d);
    expect(res.intent).toBe("next_action");
    expect(res.reply).toBe(deterministicNextAction(d.state.topTasks));
  });
});

describe("handleChat: progress_report", () => {
  it("hands off to capture without a model call", async () => {
    const res = await handleChat({ message: "I finished the auth flow" }, deps({ llm: unreachable }));
    expect(res.intent).toBe("progress_report");
    expect(res.capture?.kind).toBe("completed");
    expect(res.reply).toBe("closed it");
  });
});

describe("handleChat: model intents and the budget", () => {
  it("refuses at hard_stop without classifying", async () => {
    const res = await handleChat({ message: "tell me something interesting about octopuses" }, deps({ spent: 1000, llm: unreachable }));
    expect(res.routedBy).toBe("fallback");
    expect(res.status).toBe("budget_blocked");
  });

  it("asks before an advanced call in the restrict band", async () => {
    const { llm, calls } = answering();
    const res = await handleChat({ message: "help me plan out the job search strategy" }, deps({ spent: 900, llm }));
    expect(res.intent).toBe("planning");
    expect(res.status).toBe("needs_confirmation");
    expect(calls).toHaveLength(0);
  });

  it("runs the advanced call once confirmed", async () => {
    const { llm, calls } = answering();
    const res = await handleChat({ message: "help me plan out the job search strategy", confirmAdvanced: true }, deps({ spent: 900, llm }));
    expect(res.status).toBe("ok");
    expect(res.tier).toBe("advanced");
    expect(calls.map((c) => c.tier)).toEqual(["advanced"]);
  });

  it("downgrades to Luna in the luna_only band", async () => {
    const { llm } = answering();
    const res = await handleChat({ message: "help me plan out the job search strategy" }, deps({ spent: 960, llm }));
    expect(res.tier).toBe("default");
  });

  it("classifies with Luna only when the rules miss", async () => {
    const { llm, calls } = answering();
    const res = await handleChat({ message: "thoughts on the week ahead given everything going on" }, deps({ llm }));
    expect(res.routedBy).toBe("model");
    expect(calls.map((c) => c.feature)).toEqual(["classify", "chat"]);
  });

  it("says so plainly when no model is configured", async () => {
    const res = await handleChat({ message: "tell me something interesting about octopuses" }, deps({ llm: null }));
    expect(res.status).toBe("unavailable");
  });
});
