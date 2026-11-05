/**
 * Text handling for capture. Pure, no model.
 *
 * Captures lead with completion language ("just finished the auth flow") and
 * task titles lead with imperative verbs ("Build the auth flow"). Comparing
 * raw strings scores those badly, so both sides are reduced to token sets.
 */

/** Removed from the capture before matching. Longest phrases first. */
export const COMPLETION_PHRASES = [
  "wrapped up",
  "knocked out",
  "finished",
  "finish",
  "completed",
  "complete",
  "done",
  "did",
  "just",
] as const;

/** Words with no identifying value on either side. */
export const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "to", "of", "for", "on", "in", "at", "with", "by", "from", "my", "our",
  "i", "im", "ive", "me", "it", "its", "this", "that", "is", "was", "have", "has", "had", "got",
  "today", "finally", "also", "up", "off",
]);

/** Leading verbs a task title often starts with. Dropped from the title's token set. */
export const IMPERATIVES = new Set([
  "build", "write", "rewrite", "make", "do", "fix", "add", "create", "review", "read", "study", "apply",
  "submit", "send", "call", "email", "update", "prepare", "plan", "draft", "run", "implement", "ship",
  "learn", "practice", "clean", "follow", "finish", "complete", "start", "set", "pick", "wire", "test",
]);

/** NFKC, lower case, apostrophes removed, everything but letters and digits to single spaces. */
export function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The capture with completion language removed, still as a normalized string. */
export function stripCompletion(normalized: string): string {
  let s = ` ${normalized} `;
  for (const p of COMPLETION_PHRASES) s = s.split(` ${p} `).join(" ");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * A light suffix stemmer, enough that "bullets" meets "bullet" and "followed"
 * meets "follow". Not linguistics: just consistent on both sides.
 */
export function stem(word: string): string {
  if (/^\d+$/.test(word) || word.length <= 3) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
  if (word.endsWith("ed") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("es") && /(ss|x|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** Stemmed, stopword-free token set of a normalized string. */
export function tokenSet(normalized: string): Set<string> {
  const out = new Set<string>();
  for (const w of normalized.split(" ")) {
    if (!w || STOPWORDS.has(w)) continue;
    out.add(stem(w));
  }
  return out;
}

export function numericTokens(tokens: Set<string>): string[] {
  return [...tokens].filter((t) => /^\d+$/.test(t));
}
