import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { aiEnabled } from "@/lib/ai/flags";
import { buildHealth, migrationVersion, type HealthInputs } from "@/lib/health";
import { supabasePublicConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

/**
 * GET /api/health. Public, no session. Reports whether Supabase is configured,
 * demo vs live data, whether AI is on, and the migrations the database has
 * applied against the ones this build ships. 200 when ok, 503 when degraded.
 * No secrets: see lib/health.ts.
 */
export async function GET() {
  const cfg = supabasePublicConfig();
  const body = buildHealth({
    supabaseConfigured: cfg !== null,
    aiEnabled: aiEnabled(),
    applied: cfg ? await appliedMigrations(cfg) : null,
    expected: await shippedMigrations(),
  });
  return NextResponse.json(body, {
    status: body.status === "ok" ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}

async function appliedMigrations(cfg: { url: string; anonKey: string }): Promise<HealthInputs["applied"]> {
  try {
    const db = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc("applied_migrations");
    if (error) {
      // supabase-js reports a network failure as an error with no code, not a throw.
      if (!error.code) return { error: "unreachable" };
      return { error: error.code === "PGRST202" ? "function_missing" : "error" };
    }
    const rows = (data ?? []) as { version: unknown }[];
    return { versions: rows.map((r) => String(r.version)) };
  } catch {
    return { error: "unreachable" };
  }
}

async function shippedMigrations(): Promise<string[] | null> {
  try {
    const files = await readdir(join(process.cwd(), "supabase", "migrations"));
    return files.map(migrationVersion).filter((v): v is string => v !== null);
  } catch {
    return null;
  }
}
