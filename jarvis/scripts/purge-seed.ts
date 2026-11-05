/**
 * Removes every row marked source='seed'.
 *
 * Run this before JARVIS holds any real data. Seed rows that quietly survive
 * into production are how a dashboard starts lying.
 *
 *   npx tsx scripts/purge-seed.ts
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = process.env.SEED_USER_ID;

if (!url || !key || !userId) {
  console.error(
    "Missing env. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_USER_ID.",
  );
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data, error } = await db.rpc("purge_seed_data", { p_user_id: userId });
  if (error) throw error;

  let total = 0;
  for (const row of data as { table_name: string; rows_deleted: number }[]) {
    console.log(`  ${row.rows_deleted.toString().padStart(5)}  ${row.table_name}`);
    total += Number(row.rows_deleted);
  }
  console.log(`\n  ${total} seed rows removed.`);

  const { data: leftover } = await db
    .from("activity_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("source", "seed");
  console.log(leftover === null ? "  Ledger clean.\n" : "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
