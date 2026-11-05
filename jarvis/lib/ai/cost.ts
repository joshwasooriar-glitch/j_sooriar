/**
 * Cost accounting and budget guards.
 *
 * Invariant: every model call writes a model_runs row, including failures. A
 * call that does not record its cost is a hole in the budget guard, which is
 * how a $10 budget quietly becomes a $60 budget.
 */

import { specFor, specForId, type ModelTier } from "./models";

export type BudgetState = "ok" | "warn" | "restrict" | "luna_only" | "hard_stop";

export interface BudgetConfig {
  monthlyCents: number;
  warnCents: number;
  restrictCents: number;
  hardStopCents: number;
}

export function budgetConfig(): BudgetConfig {
  return {
    monthlyCents: Number(process.env.JARVIS_MONTHLY_BUDGET_CENTS ?? 1000),
    warnCents: Number(process.env.JARVIS_WARN_CENTS ?? 700),
    restrictCents: Number(process.env.JARVIS_RESTRICT_CENTS ?? 850),
    hardStopCents: Number(process.env.JARVIS_HARD_STOP_CENTS ?? 950),
  };
}

export interface Usage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

/**
 * Cost in cents for one call.
 *
 * `inputTokens` is the full input count. `cachedInputTokens` is the portion of
 * it that was served from cache, so the uncached remainder is the difference.
 * Getting this backwards overstates cost by roughly 10x on cached calls.
 */
const TIERS: ModelTier[] = ["default", "advanced", "embedding"];

export function estimateCostCents(tier: ModelTier | string, usage: Usage): number {
  const spec = TIERS.includes(tier as ModelTier)
    ? specFor(tier as ModelTier)
    : specForId(tier);

  if (!spec) return 0;

  const cached = Math.min(usage.cachedInputTokens, usage.inputTokens);
  const fresh = Math.max(0, usage.inputTokens - cached);

  const dollars =
    (fresh / 1_000_000) * spec.inputPerM +
    (cached / 1_000_000) * spec.cachedInputPerM +
    (usage.outputTokens / 1_000_000) * spec.outputPerM;

  return dollars * 100;
}

export function budgetState(spentCents: number, cfg = budgetConfig()): BudgetState {
  if (spentCents >= cfg.monthlyCents) return "hard_stop";
  if (spentCents >= cfg.hardStopCents) return "luna_only";
  if (spentCents >= cfg.restrictCents) return "restrict";
  if (spentCents >= cfg.warnCents) return "warn";
  return "ok";
}

export interface GateDecision {
  allowed: boolean;
  /** Tier the call is permitted to use, possibly downgraded. */
  tier: ModelTier;
  /** True when the UI must ask Joshwa before proceeding. */
  needsConfirmation: boolean;
  reason: string;
}

/**
 * Decide whether a call may proceed at the requested tier.
 *
 * Deterministic features never degrade. This gate only ever affects paid model
 * calls, so at hard_stop the dashboard still renders and progress still
 * computes, because those numbers come from SQL.
 */
export function gate(
  requested: ModelTier,
  spentCents: number,
  cfg = budgetConfig(),
): GateDecision {
  const state = budgetState(spentCents, cfg);

  if (requested === "embedding") {
    return state === "hard_stop"
      ? { allowed: false, tier: requested, needsConfirmation: false, reason: "Monthly budget reached." }
      : { allowed: true, tier: requested, needsConfirmation: false, reason: "" };
  }

  switch (state) {
    case "ok":
    case "warn":
      return { allowed: true, tier: requested, needsConfirmation: false, reason: "" };

    case "restrict":
      return requested === "advanced"
        ? {
            allowed: true,
            tier: "advanced",
            needsConfirmation: true,
            reason: `Spent ${fmt(spentCents)} of ${fmt(cfg.monthlyCents)}. Confirm before using the advanced model.`,
          }
        : { allowed: true, tier: "default", needsConfirmation: false, reason: "" };

    case "luna_only":
      return requested === "advanced"
        ? {
            allowed: true,
            tier: "default",
            needsConfirmation: false,
            reason: `Advanced model disabled at ${fmt(spentCents)}. Falling back to the default model.`,
          }
        : { allowed: true, tier: "default", needsConfirmation: false, reason: "" };

    case "hard_stop":
      return {
        allowed: false,
        tier: "default",
        needsConfirmation: true,
        reason: `Monthly budget of ${fmt(cfg.monthlyCents)} reached. Deterministic features still work.`,
      };
  }
}

/**
 * Per-job approval. A single job that would eat a meaningful share of what is
 * left should be confirmed, not discovered afterwards.
 */
export function jobNeedsApproval(
  estimateCents: number,
  spentCents: number,
  cfg = budgetConfig(),
): boolean {
  const remaining = Math.max(0, cfg.monthlyCents - spentCents);
  if (remaining === 0) return true;
  return estimateCents > remaining * 0.15;
}

export function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Projected end-of-month spend from the run rate so far.
 * `dayOfMonth` is 1-indexed.
 */
export function projectMonthly(spentCents: number, dayOfMonth: number, daysInMonth: number): number {
  if (dayOfMonth <= 0) return spentCents;
  return (spentCents / dayOfMonth) * daysInMonth;
}
