/**
 * Intent classification and model routing.
 *
 * Two layers, in order:
 *
 *   1. Rules. Free, instant, and correct for most of what Joshwa actually
 *      types. "how are we doing" never needs a model to be recognized.
 *   2. Luna classification. Only when the rules are not confident.
 *
 * Sol is reached through an explicit gate, never by default.
 */

import type { ModelTier } from "./models";

export type Intent =
  | "status_query"      // how are we doing, what's my progress
  | "next_action"       // what should I work on
  | "progress_report"   // I finished X, I applied to 4 jobs
  | "task_management"   // create, edit, reschedule a task
  | "goal_management"   // create or restructure a goal
  | "calendar"
  | "memory"            // remember this, forget that
  | "simple_question"
  | "research"          // needs current web information
  | "deep_research"     // multi source, conflicting evidence
  | "coding"
  | "planning"          // strategic, multi step
  | "conversation";

export interface Routed {
  intent: Intent;
  tier: ModelTier;
  /** True when deterministic code alone can answer, with no model call at all. */
  deterministicOnly: boolean;
  confidence: number;
  via: "rules" | "model";
}

/** Intents that escalate to the advanced model. Everything else runs on default. */
const ADVANCED_INTENTS = new Set<Intent>(["deep_research", "planning", "coding"]);

/**
 * Intents whose answer comes entirely from SQL and the progress engine.
 * The model only writes prose around already-computed numbers, so if the budget
 * is exhausted these still work.
 */
const DETERMINISTIC_CORE = new Set<Intent>(["status_query", "next_action"]);

interface Rule {
  intent: Intent;
  pattern: RegExp;
  confidence: number;
}

/**
 * Ordered. First match wins, so put the specific before the general.
 */
const RULES: Rule[] = [
  // Status. This is the north star question, so it must never cost a
  // classification call.
  { intent: "status_query", confidence: 0.95, pattern: /\b(how are we doing|how am i doing|how'?s it going|progress (towards|toward|on)|where (am i|do i stand)|am i (on track|behind)|what am i (falling )?behind on|status (update|report))\b/i },

  { intent: "next_action", confidence: 0.92, pattern: /\b(what should i (do|work on|focus on)|what'?s (next|important|the priority)|top (3|three|priorities)|what do i need to get done|next action)\b/i },

  // The leading "i" is optional: people drop it constantly in quick capture
  // ("just shipped the migration", "finished the auth flow").
  { intent: "progress_report", confidence: 0.88, pattern: /\b(?:(?:i\s+)?(?:just\s+)?(?:finished|completed|applied|submitted|shipped|logged|knocked out|wrapped up)|i did|done with|got through)\b/i },

  { intent: "memory", confidence: 0.94, pattern: /\b(remember (that|this)|don'?t forget|forget (that|about)|make a note|note that i)\b/i },

  { intent: "task_management", confidence: 0.85, pattern: /\b(add a task|create a task|new task|remind me to|move .* to (tomorrow|next week)|reschedule|push .* back|mark .* (done|complete))\b/i },

  { intent: "goal_management", confidence: 0.85, pattern: /\b(new goal|create a goal|add a goal|set a goal|change (my|the) (goal|target|deadline)|break (this|that|it) (down|into))\b/i },

  { intent: "calendar", confidence: 0.85, pattern: /\b(calendar|schedule|my day|free time|find time|when am i free|what'?s on (today|tomorrow)|book|meeting)\b/i },

  { intent: "deep_research", confidence: 0.8, pattern: /\b(deep (dive|research)|research .* (thoroughly|in depth|comprehensively)|compare .* (options|approaches|vendors)|investigate|full (analysis|writeup))\b/i },

  { intent: "research", confidence: 0.75, pattern: /\b(research|look up|find out|what'?s the latest|current (price|version|status)|who is|search for)\b/i },

  { intent: "coding", confidence: 0.78, pattern: /\b(debug|why (isn'?t|doesn'?t|won'?t) (this|my|the) (code|build|test)|stack trace|type ?error|refactor|write a (function|script|query)|fix this (bug|error))\b/i },

  { intent: "planning", confidence: 0.75, pattern: /\b(plan (for|out)|strategy|roadmap|how (should|do) i (approach|tackle|get to)|create a plan|figure out the best (route|way|approach))\b/i },
];

/**
 * Rule-based routing. Returns null when nothing matches confidently enough.
 * Costs $0 and takes microseconds.
 */
export function routeByRules(text: string): Routed | null {
  const t = text.trim();
  if (t.length === 0) return null;

  for (const rule of RULES) {
    if (rule.pattern.test(t)) {
      return {
        intent: rule.intent,
        tier: ADVANCED_INTENTS.has(rule.intent) ? "advanced" : "default",
        deterministicOnly: DETERMINISTIC_CORE.has(rule.intent),
        confidence: rule.confidence,
        via: "rules",
      };
    }
  }

  // Short questions with no keyword are almost always plain conversation.
  if (t.length < 60 && /\?$/.test(t)) {
    return {
      intent: "simple_question",
      tier: "default",
      deterministicOnly: false,
      confidence: 0.6,
      via: "rules",
    };
  }

  return null;
}

/** The classification prompt used only when rules fail. Kept tiny on purpose. */
export const CLASSIFY_PROMPT = `Classify the user's message into exactly one intent.

Intents: status_query, next_action, progress_report, task_management,
goal_management, calendar, memory, simple_question, research, deep_research,
coding, planning, conversation.

Reply with only the intent name. No punctuation, no explanation.`;

export function tierForIntent(intent: Intent): ModelTier {
  return ADVANCED_INTENTS.has(intent) ? "advanced" : "default";
}

export function isDeterministic(intent: Intent): boolean {
  return DETERMINISTIC_CORE.has(intent);
}

/**
 * The escalation gate from ARCHITECTURE.md section 7.
 *
 * Before any advanced-tier call, all four must clear. Encoded as a function so
 * the check is testable rather than a comment someone forgets.
 */
export interface EscalationContext {
  canAnswerDeterministically: boolean;
  retrievalFitsDefaultModel: boolean;
  hasCachedResearch: boolean;
  budgetAllowsAdvanced: boolean;
}

export function mayEscalate(ctx: EscalationContext): { ok: boolean; blockedBy: string | null } {
  if (ctx.canAnswerDeterministically) return { ok: false, blockedBy: "deterministic code can answer this" };
  if (ctx.retrievalFitsDefaultModel) return { ok: false, blockedBy: "retrieval fits the default model" };
  if (ctx.hasCachedResearch) return { ok: false, blockedBy: "a cached research report covers this" };
  if (!ctx.budgetAllowsAdvanced) return { ok: false, blockedBy: "budget guard" };
  return { ok: true, blockedBy: null };
}
