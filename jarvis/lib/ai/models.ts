/**
 * The only file in this repo that names a model.
 *
 * Never hardcode a model ID at a call site. This lineup will move again within
 * six months and a rename must be a one-line change here.
 *
 * Pricing verified September 25, 2026. Cached input reads get a 90% discount.
 */

export type ModelTier = "default" | "advanced" | "embedding";

export interface ModelSpec {
  id: string;
  /** USD per million tokens. */
  inputPerM: number;
  cachedInputPerM: number;
  outputPerM: number;
  contextWindow: number;
  maxOutput: number;
}

export const MODELS = {
  /** Workhorse. Target 95% of all calls. */
  default: {
    id: process.env.JARVIS_DEFAULT_MODEL ?? "gpt-6-luna",
    inputPerM: 0.1,
    cachedInputPerM: 0.01,
    outputPerM: 0.5,
    contextWindow: 1_050_000,
    maxOutput: 128_000,
  },
  /** Escalation only. 20x the input price, 20x the output price. */
  advanced: {
    id: process.env.JARVIS_ADVANCED_MODEL ?? "gpt-6-sol",
    inputPerM: 2.0,
    cachedInputPerM: 0.2,
    outputPerM: 10.0,
    contextWindow: 1_050_000,
    maxOutput: 128_000,
  },
  embedding: {
    id: process.env.JARVIS_EMBEDDING_MODEL ?? "text-embedding-3-small",
    inputPerM: 0.02,
    cachedInputPerM: 0.02,
    outputPerM: 0,
    contextWindow: 8_191,
    maxOutput: 0,
  },
} as const satisfies Record<ModelTier, ModelSpec>;

export function specFor(tier: ModelTier): ModelSpec {
  return MODELS[tier];
}

/** Resolve a stored model id back to its spec so historical costs stay correct. */
export function specForId(id: string): ModelSpec | null {
  for (const spec of Object.values(MODELS)) {
    if (spec.id === id) return spec;
  }
  return null;
}

/**
 * Claude Fable 5.1 is $10/$50 per million. It is the coding agent that builds
 * this repo. It must never appear in the runtime path.
 *
 * Build with Fable. Run on Luna.
 */
export const NEVER_AT_RUNTIME = ["claude-fable-5-1", "gpt-6-astra"] as const;

export function assertRuntimeSafe(modelId: string): void {
  if ((NEVER_AT_RUNTIME as readonly string[]).includes(modelId)) {
    throw new Error(
      `${modelId} is a build-time model and must never be called at runtime. See COSTS.md.`,
    );
  }
}
