import { describe, expect, it } from "vitest";
import {
  budgetState,
  estimateCostCents,
  gate,
  jobNeedsApproval,
  ModelCallError,
  projectMonthly,
  withCostTracking,
  type BudgetConfig,
} from "../lib/ai/cost";
import { BudgetLedger } from "../lib/ai/llm";
import { assertRuntimeSafe, MODELS } from "../lib/ai/models";

const CFG: BudgetConfig = {
  monthlyCents: 1000,
  warnCents: 700,
  restrictCents: 850,
  hardStopCents: 950,
};

describe("estimateCostCents", () => {
  it("prices a default-model call correctly", () => {
    // 1M input + 1M output on Luna = $0.10 + $0.50 = $0.60 = 60 cents.
    const cents = estimateCostCents("default", {
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 1_000_000,
    });
    expect(cents).toBeCloseTo(60, 6);
  });

  it("prices an advanced-model call correctly", () => {
    // 1M in + 1M out on Sol = $2.00 + $10.00 = $12.00 = 1200 cents.
    const cents = estimateCostCents("advanced", {
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 1_000_000,
    });
    expect(cents).toBeCloseTo(1200, 6);
  });

  it("applies the 90 percent cached-input discount", () => {
    const uncached = estimateCostCents("default", {
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 0,
    });
    const fullyCached = estimateCostCents("default", {
      inputTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
      outputTokens: 0,
    });
    expect(fullyCached).toBeCloseTo(uncached * 0.1, 6);
  });

  it("treats cachedInputTokens as a subset of inputTokens, not an addition", () => {
    // This is the direction that is easy to get backwards. Half cached should
    // cost 55% of full price, not 110%.
    const half = estimateCostCents("default", {
      inputTokens: 1_000_000,
      cachedInputTokens: 500_000,
      outputTokens: 0,
    });
    expect(half).toBeCloseTo(10 * 0.55, 6);
  });

  it("never exceeds the uncached price", () => {
    const absurd = estimateCostCents("default", {
      inputTokens: 1000,
      cachedInputTokens: 999_999,
      outputTokens: 0,
    });
    const plain = estimateCostCents("default", {
      inputTokens: 1000,
      cachedInputTokens: 0,
      outputTokens: 0,
    });
    expect(absurd).toBeLessThanOrEqual(plain);
  });

  it("returns zero for an unknown model rather than NaN", () => {
    const cents = estimateCostCents("some-model-that-does-not-exist", {
      inputTokens: 1000,
      cachedInputTokens: 0,
      outputTokens: 1000,
    });
    expect(cents).toBe(0);
  });

  it("prices a realistic chat turn at well under a cent", () => {
    // 3k in, 400 out on Luna.
    const cents = estimateCostCents("default", {
      inputTokens: 3000,
      cachedInputTokens: 2000,
      outputTokens: 400,
    });
    expect(cents).toBeLessThan(0.05);
  });
});

describe("budgetState", () => {
  it("maps each threshold", () => {
    expect(budgetState(0, CFG)).toBe("ok");
    expect(budgetState(699, CFG)).toBe("ok");
    expect(budgetState(700, CFG)).toBe("warn");
    expect(budgetState(850, CFG)).toBe("restrict");
    expect(budgetState(950, CFG)).toBe("luna_only");
    expect(budgetState(1000, CFG)).toBe("hard_stop");
    expect(budgetState(5000, CFG)).toBe("hard_stop");
  });
});

describe("gate", () => {
  it("allows everything under the warn threshold", () => {
    const d = gate("advanced", 100, CFG);
    expect(d.allowed).toBe(true);
    expect(d.tier).toBe("advanced");
    expect(d.needsConfirmation).toBe(false);
  });

  it("requires confirmation for the advanced model in restrict", () => {
    const d = gate("advanced", 860, CFG);
    expect(d.allowed).toBe(true);
    expect(d.needsConfirmation).toBe(true);
  });

  it("leaves the default model untouched in restrict", () => {
    const d = gate("default", 860, CFG);
    expect(d.allowed).toBe(true);
    expect(d.needsConfirmation).toBe(false);
  });

  it("silently downgrades the advanced model in luna_only", () => {
    const d = gate("advanced", 960, CFG);
    expect(d.allowed).toBe(true);
    expect(d.tier).toBe("default");
    expect(d.needsConfirmation).toBe(false);
  });

  it("blocks paid calls at hard_stop", () => {
    expect(gate("default", 1000, CFG).allowed).toBe(false);
    expect(gate("advanced", 1000, CFG).allowed).toBe(false);
  });

  it("allows embeddings until hard_stop", () => {
    expect(gate("embedding", 960, CFG).allowed).toBe(true);
    expect(gate("embedding", 1000, CFG).allowed).toBe(false);
  });

  it("always explains a blocked or downgraded call", () => {
    expect(gate("default", 1000, CFG).reason.length).toBeGreaterThan(0);
    expect(gate("advanced", 960, CFG).reason.length).toBeGreaterThan(0);
  });
});

describe("jobNeedsApproval", () => {
  it("approves a small job against a healthy budget", () => {
    // 10 cents against 900 remaining is about 1%.
    expect(jobNeedsApproval(10, 100, CFG)).toBe(false);
  });

  it("asks when a job exceeds 15 percent of what is left", () => {
    // 200 cents against 500 remaining is 40%.
    expect(jobNeedsApproval(200, 500, CFG)).toBe(true);
  });

  it("always asks when nothing is left", () => {
    expect(jobNeedsApproval(1, 1000, CFG)).toBe(true);
  });
});

describe("projectMonthly", () => {
  it("extrapolates the run rate", () => {
    expect(projectMonthly(100, 10, 30)).toBeCloseTo(300, 6);
  });

  it("does not divide by zero on day zero", () => {
    expect(projectMonthly(100, 0, 30)).toBe(100);
  });
});

describe("runtime model safety", () => {
  it("refuses build-time models at runtime", () => {
    expect(() => assertRuntimeSafe("claude-fable-5-1")).toThrow();
    expect(() => assertRuntimeSafe("gpt-6-astra")).toThrow();
  });

  it("allows the configured runtime models", () => {
    expect(() => assertRuntimeSafe(MODELS.default.id)).not.toThrow();
    expect(() => assertRuntimeSafe(MODELS.advanced.id)).not.toThrow();
  });
});

describe("withCostTracking", () => {
  const usage = { inputTokens: 3000, cachedInputTokens: 2000, outputTokens: 400 };

  function recorder() {
    const rows: import("../lib/ai/cost").ModelRunRecord[] = [];
    return { rows, record: async (r: (typeof rows)[number]) => void rows.push(r) };
  }

  it("writes one row with the real cost on success", async () => {
    const { rows, record } = recorder();
    let t = 1000;
    const value = await withCostTracking(
      { tier: "default", feature: "chat", record, clock: () => (t += 250) },
      async () => ({ value: "hi", usage }),
    );
    expect(value).toBe("hi");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      model: MODELS.default.id,
      feature: "chat",
      ok: true,
      input_tokens: 3000,
      cached_input_tokens: 2000,
      output_tokens: 400,
      latency_ms: 250,
    });
    expect(rows[0].cost_cents).toBeCloseTo(estimateCostCents("default", usage));
  });

  it("writes an ok=false row on failure, with any partial usage, and rethrows", async () => {
    const { rows, record } = recorder();
    await expect(
      withCostTracking({ tier: "default", feature: "chat", record }, async () => {
        throw new ModelCallError("timeout", { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 0 });
      }),
    ).rejects.toThrow("timeout");
    expect(rows).toHaveLength(1);
    expect(rows[0].ok).toBe(false);
    expect(rows[0].cost_cents).toBeCloseTo(estimateCostCents("default", { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 0 }));
  });

  it("records zero usage when a plain error carries none", async () => {
    const { rows, record } = recorder();
    await expect(
      withCostTracking({ tier: "advanced", feature: "chat", record }, async () => {
        throw new Error("network");
      }),
    ).rejects.toThrow("network");
    expect(rows[0]).toMatchObject({ ok: false, input_tokens: 0, cost_cents: 0, model: MODELS.advanced.id });
  });

  it("fails the call when the row cannot be written", async () => {
    await expect(
      withCostTracking(
        { tier: "default", feature: "chat", record: async () => { throw new Error("db down"); } },
        async () => ({ value: "hi", usage }),
      ),
    ).rejects.toThrow("db down");
  });

  it("never records more cached tokens than input tokens", async () => {
    const { rows, record } = recorder();
    await withCostTracking({ tier: "default", feature: "chat", record }, async () => ({
      value: 1,
      usage: { inputTokens: 100, cachedInputTokens: 500, outputTokens: 0 },
    }));
    expect(rows[0].cached_input_tokens).toBe(100);
  });
});

describe("BudgetLedger", () => {
  it("gates on the running total, not the starting figure", () => {
    const ledger = new BudgetLedger(940, CFG);
    expect(ledger.check("default").allowed).toBe(true);
    ledger.add(70);
    expect(ledger.spentCents).toBe(1010);
    expect(ledger.check("default").allowed).toBe(false);
  });
});
