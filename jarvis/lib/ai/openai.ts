import "server-only";
import OpenAI from "openai";
import {
  ModelCallError,
  withCostTracking,
  type RunRecorder,
  type Usage,
} from "./cost";
import { BudgetBlockedError, type BudgetLedger, type Llm } from "./llm";

/** True when a key is configured. Never exposes the key itself. */
export function hasOpenAIKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

let client: OpenAI | null = null;

function openai(): OpenAI {
  // maxRetries 0: an SDK-internal retry would be a second billed call with no
  // model_runs row. Every attempt goes through withCostTracking on its own.
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 20_000 });
  return client;
}

/**
 * The real Llm. Every call is budget-gated against the running ledger, then
 * made through withCostTracking so it writes exactly one model_runs row.
 */
export function makeOpenAILlm(opts: { record: RunRecorder; ledger: BudgetLedger }): Llm {
  return async (req) => {
    const decision = opts.ledger.check(req.tier);
    if (!decision.allowed) throw new BudgetBlockedError(decision);

    // The gate may downgrade (luna_only), never upgrade.
    const tier = decision.tier;

    return withCostTracking({ tier, feature: req.feature, record: tracked(opts) }, async (spec) => {
      let res: OpenAI.Chat.Completions.ChatCompletion;
      try {
        res = await openai().chat.completions.create({
          model: spec.id,
          messages: [{ role: "system", content: req.system }, ...req.messages],
          max_completion_tokens: req.maxOutputTokens ?? 800,
          ...(req.json ? { response_format: { type: "json_object" as const } } : {}),
        });
      } catch (err) {
        throw new ModelCallError(err instanceof Error ? err.message : "Model call failed");
      }

      const usage: Usage = {
        inputTokens: res.usage?.prompt_tokens ?? 0,
        cachedInputTokens: res.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        outputTokens: res.usage?.completion_tokens ?? 0,
      };
      const text = res.choices[0]?.message?.content ?? "";
      if (!text) throw new ModelCallError("Model returned no content", usage);
      return { value: text, usage };
    });
  };
}

/** Wraps the recorder so the running ledger sees each call's cost as soon as it is recorded. */
function tracked(opts: { record: RunRecorder; ledger: BudgetLedger }): RunRecorder {
  return async (row) => {
    await opts.record(row);
    opts.ledger.add(row.cost_cents);
  };
}
