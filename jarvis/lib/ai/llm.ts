/**
 * The model-call seam.
 *
 * Chat and capture logic depend on the `Llm` type, never on the OpenAI SDK, so
 * they can be tested without a network and the budget rules stay in one place.
 * The real implementation lives in lib/ai/openai.ts.
 */

import { gate, type BudgetConfig, type GateDecision } from "./cost";
import type { ModelTier } from "./models";

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  tier: ModelTier;
  /** model_runs.feature for this call. */
  feature: string;
  /** Stable system prompt. Goes first so it caches. */
  system: string;
  /** Context packet and user message. Dynamic content lives here, never in `system`. */
  messages: LlmMessage[];
  json?: boolean;
  maxOutputTokens?: number;
}

export type Llm = (req: LlmRequest) => Promise<string>;

/**
 * Budget state for one request. Starts at the month's recorded spend and grows
 * with each call, so a classify call followed by a chat call is gated on the
 * running total rather than on a stale figure.
 */
export class BudgetLedger {
  constructor(
    private spent: number,
    private readonly cfg?: BudgetConfig,
  ) {}

  get spentCents(): number {
    return this.spent;
  }

  add(cents: number): void {
    this.spent += cents;
  }

  check(tier: ModelTier): GateDecision {
    return this.cfg ? gate(tier, this.spent, this.cfg) : gate(tier, this.spent);
  }
}

/** Thrown when the budget gate refuses a call. Carries the gate's reason for the user. */
export class BudgetBlockedError extends Error {
  constructor(readonly decision: GateDecision) {
    super(decision.reason || "Budget gate refused the call.");
    this.name = "BudgetBlockedError";
  }
}
