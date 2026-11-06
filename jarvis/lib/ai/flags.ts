/**
 * The AI feature flag. Server-side only, default OFF.
 *
 * When off, no model request may happen under any intent or budget state. The
 * engine, capture and every dashboard number keep working, because none of
 * them need a model. Only the exact string "true" turns it on, so a typo or an
 * unset variable fails closed.
 */
export function aiEnabled(): boolean {
  return process.env.JARVIS_AI_ENABLED === "true";
}

export class AiDisabledError extends Error {
  constructor() {
    super("AI is off (JARVIS_AI_ENABLED is not \"true\"). No model request was made.");
    this.name = "AiDisabledError";
  }
}
