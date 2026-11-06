/**
 * Deterministic quantity extraction for count goals. No model.
 *
 * A quantity is a 1 to 3 digit number, or a number word from one to twelve,
 * that is NOT:
 *   - 4 or more digits (years, ids)
 *   - right after "in", "on" or "by" ("by 5", "on 12", "in 2026")
 *   - part of a date, time or range ("11/5", "3:30", "2026-11-05")
 *   - an ordinal or a time of day ("3rd", "5pm")
 * "a" and "an" are not quantities: an explicit number is required.
 *
 * The goal is matched on a noun from its unit or its title ("3 applications",
 * "did 3 affirmations"), with the quantity within three words before it.
 */

import type { Goal } from "@/lib/engine/types";
import { normalize, stem, STOPWORDS } from "./text";

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const BLOCKING_PREPOSITIONS = new Set(["in", "on", "by"]);
const MAX_GAP = 3;

/** Words, keeping date/time/range punctuation inside a token so "11/5" stays one token. */
export function wordTokens(text: string): string[] {
  return text.normalize("NFKC").toLowerCase().match(/[a-z0-9]+(?:[/:.\-][a-z0-9]+)*/g) ?? [];
}

/** The quantity a token represents, or null when it is not one. */
export function quantityAt(tokens: string[], i: number): number | null {
  const t = tokens[i];
  const prev = tokens[i - 1];
  if (prev && BLOCKING_PREPOSITIONS.has(prev)) return null;
  if (/^\d{1,3}$/.test(t)) return Number(t);
  if (NUMBER_WORDS[t] !== undefined) return NUMBER_WORDS[t];
  return null; // 4+ digits, "11/5", "3:30", "3rd", "5pm", words
}

/** Every eligible quantity in the text, in order. Exported for tests. */
export function quantities(text: string): number[] {
  const tokens = wordTokens(text);
  return tokens.map((_, i) => quantityAt(tokens, i)).filter((q): q is number => q !== null);
}

export interface CountMatch {
  goal: Goal;
  quantity: number;
}

/** Time words in a title describe a schedule, not the thing being counted. */
const TIME_WORDS = new Set(["time", "day", "week", "month", "year", "hour", "minute", "daily", "weekly", "monthly"]);

/**
 * The nouns a capture may use for a goal, stemmed.
 *
 * Unit words: every word of the unit, so "times said" answers to "3 times"
 * and "3 times said". A unit is explicit, so it is trusted as is.
 *
 * Title words: what people actually say. "Manifestation + Affirmations" with
 * unit "times said" must answer to "did 3 affirmations". Stopwords, words with
 * digits ("4x"), words under 3 letters and time words ("Train 4x a week" must
 * not claim "3 weeks") are left out. A title word can still overreach
 * ("3 data points" for "Land a SWE or data role"); that is acceptable because
 * a count capture never writes without the confirmation card.
 */
export function goalNouns(goal: Goal): Set<string> {
  const out = new Set<string>();
  for (const w of (goal.unit ?? "").toLowerCase().match(/[a-z]+/g) ?? []) {
    if (!STOPWORDS.has(w)) out.add(stem(w));
  }
  for (const w of normalize(goal.title).split(" ")) {
    if (!w || w.length < 3 || /\d/.test(w) || STOPWORDS.has(w)) continue;
    const s = stem(w);
    if (!TIME_WORDS.has(s)) out.add(s);
  }
  return out;
}

/**
 * Every active count goal the text could be logging against: a quantity
 * within three words before one of the goal's nouns. More than one result
 * means a picker; none means this is not a count capture.
 */
export function matchCountGoals(text: string, goals: Goal[]): CountMatch[] {
  const tokens = wordTokens(text);
  const out: CountMatch[] = [];

  for (const goal of goals) {
    if (goal.status !== "active" || goal.metric_type !== "count") continue;
    const nouns = goalNouns(goal);
    if (nouns.size === 0) continue;

    for (let i = 0; i < tokens.length; i++) {
      if (!nouns.has(stem(tokens[i]))) continue;
      let quantity: number | null = null;
      for (let j = i - 1; j >= Math.max(0, i - MAX_GAP); j--) {
        quantity = quantityAt(tokens, j);
        if (quantity !== null) break;
      }
      if (quantity !== null && quantity > 0) {
        out.push({ goal, quantity });
        break;
      }
    }
  }
  return out;
}
