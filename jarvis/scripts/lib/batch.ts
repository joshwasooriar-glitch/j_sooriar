/**
 * Batch-insert rows with explicit defaults.
 *
 * supabase-js builds one column list from the union of keys across a batch
 * and sends explicit null for any key a row lacks. That null overrides the
 * column DEFAULT, so a NOT NULL column with a default (milestones.status,
 * tasks.status, tasks.scale) fails as soon as one row in the batch sets it and
 * another does not. Single-row inserts are not affected.
 *
 * withDefaults puts every optional key on every row, defaults first, then
 * asserts the key sets match, so a future optional column fails here, loudly,
 * instead of reaching the database as a silent NULL.
 */

export function withDefaults<T extends Record<string, unknown>>(
  table: string,
  defaults: Record<string, unknown>,
  rows: T[],
): Record<string, unknown>[] {
  const out = rows.map((r) => ({ ...defaults, ...r }));
  assertSameKeys(table, out);
  return out;
}

/** Throws when rows in one batch do not all carry the same keys. */
export function assertSameKeys(table: string, rows: Record<string, unknown>[]): void {
  if (rows.length < 2) return;
  const all = new Set(rows.flatMap((r) => Object.keys(r)));
  rows.forEach((r, i) => {
    const missing = [...all].filter((k) => !(k in r));
    if (missing.length) {
      throw new Error(
        `${table}: row ${i} is missing ${missing.join(", ")}. supabase-js would send NULL and override the column default. Add it to the defaults.`,
      );
    }
  });
}
