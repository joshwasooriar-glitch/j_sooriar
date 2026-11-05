import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BudgetConfig, ModelRunRecord } from "@/lib/ai/cost";
import { aiEnabled } from "@/lib/ai/flags";
import { BudgetLedger } from "@/lib/ai/llm";
import { makeOpenAILlm } from "@/lib/ai/openai";
import { handleChat, type ChatDeps } from "@/lib/chat/chat";
import { engineState } from "@/lib/chat/state";
import { demoSnapshot } from "@/lib/db/demo";

const NOW = new Date("2026-11-05T16:00:00Z");
const CFG: BudgetConfig = { monthlyCents: 1000, warnCents: 700, restrictCents: 850, hardStopCents: 950 };

/** One message per intent, plus two that only a model classifier could route. */
const MESSAGES = [
  "Hi, how are we doing in terms of progress towards the goals?",
  "what should I work on?",
  "I finished the auth flow",
  "add a task to email the recruiter",
  "set a goal to run a half marathon",
  "what's on today",
  "remember that I prefer mornings for deep work",
  "is it cold out?",
  "research the latest Next.js release",
  "deep dive into vector databases thoroughly",
  "debug why my build fails, stack trace attached",
  "help me plan out the job search strategy",
  "thoughts on the week ahead given everything going on",
  "hmm",
];

/** Budget states from comfortably ok through hard_stop. */
const SPENT = [0, 750, 900, 960, 1000];

const ORIGINAL = { flag: process.env.JARVIS_AI_ENABLED, key: process.env.OPENAI_API_KEY };

function counter() {
  const state = { requests: 0, rows: [] as ModelRunRecord[] };
  const fetch: typeof globalThis.fetch = async () => {
    state.requests++;
    return new Response(
      JSON.stringify({
        id: "x",
        object: "chat.completion",
        created: 0,
        model: "m",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "planning" } }],
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  return { state, fetch, record: async (r: ModelRunRecord) => void state.rows.push(r) };
}

function deps(spent: number, aiOn: boolean, c: ReturnType<typeof counter>): ChatDeps {
  const ledger = new BudgetLedger(spent, CFG);
  return {
    now: NOW,
    aiEnabled: aiOn,
    state: engineState(demoSnapshot(NOW), NOW),
    memories: [],
    ledger,
    // Wired with a real Llm on purpose: the flag must hold even when one exists.
    llm: makeOpenAILlm({ record: c.record, ledger, fetch: c.fetch }),
    capture: async () => ({ outcome: "closed_task", reply: "ok" }),
  };
}

describe("JARVIS_AI_ENABLED", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-test-not-real";
  });
  afterEach(() => {
    process.env.JARVIS_AI_ENABLED = ORIGINAL.flag;
    process.env.OPENAI_API_KEY = ORIGINAL.key;
    if (ORIGINAL.flag === undefined) delete process.env.JARVIS_AI_ENABLED;
    if (ORIGINAL.key === undefined) delete process.env.OPENAI_API_KEY;
  });

  it("defaults to off, and only the exact string true turns it on", () => {
    delete process.env.JARVIS_AI_ENABLED;
    expect(aiEnabled()).toBe(false);
    for (const v of ["1", "TRUE", "yes", "on", " true", ""]) {
      process.env.JARVIS_AI_ENABLED = v;
      expect(aiEnabled()).toBe(false);
    }
    process.env.JARVIS_AI_ENABLED = "true";
    expect(aiEnabled()).toBe(true);
  });

  it("makes zero model requests under every intent and budget state when off", async () => {
    delete process.env.JARVIS_AI_ENABLED;
    const c = counter();
    for (const spent of SPENT) {
      for (const message of MESSAGES) {
        await handleChat({ message, confirmAdvanced: true }, deps(spent, false, c));
      }
    }
    expect(c.state.requests).toBe(0);
    expect(c.state.rows).toHaveLength(0);
  });

  it("refuses at the Llm itself when off, even if a caller claims AI is on", async () => {
    delete process.env.JARVIS_AI_ENABLED;
    const c = counter();
    for (const message of MESSAGES) {
      await handleChat({ message, confirmAdvanced: true }, deps(0, true, c));
    }
    expect(c.state.requests).toBe(0);
    expect(c.state.rows).toHaveLength(0);
  });

  it("still answers the north star question from the engine when off", async () => {
    delete process.env.JARVIS_AI_ENABLED;
    const res = await handleChat({ message: MESSAGES[0] }, deps(0, false, counter()));
    expect(res.deterministic).toBe(true);
    expect(res.reply).toContain("Furthest behind:");
  });

  it("control: the same harness does see requests when on, so zero above is meaningful", async () => {
    process.env.JARVIS_AI_ENABLED = "true";
    const c = counter();
    await handleChat({ message: "help me plan out the job search strategy" }, deps(0, true, c));
    expect(c.state.requests).toBeGreaterThan(0);
    expect(c.state.rows.length).toBe(c.state.requests);
  });
});
