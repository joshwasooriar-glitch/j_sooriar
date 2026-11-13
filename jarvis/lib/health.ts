/**
 * What GET /api/health reports. Pure: the route gathers the inputs.
 *
 * Nothing here may carry a secret or a raw error message. Supabase is reported
 * as configured or not, never by URL or key, and database failures are mapped
 * to a fixed code.
 */

export type MigrationsError = "unreachable" | "function_missing" | "error";

export interface HealthInputs {
  supabaseConfigured: boolean;
  aiEnabled: boolean;
  /** Versions the database reports, or an error code. Null when Supabase is not configured. */
  applied: { versions: string[] } | { error: MigrationsError } | null;
  /** Versions shipped with this build (supabase/migrations), or null if the folder could not be read. */
  expected: string[] | null;
}

export interface Health {
  status: "ok" | "degraded";
  supabase: { configured: boolean; reachable: boolean | null };
  data: "live" | "demo";
  ai: { enabled: boolean };
  migrations: {
    applied: string[] | null;
    expected: string[] | null;
    pending: string[] | null;
    error: MigrationsError | null;
  };
}

/** "20261105000000_ledger_functions.sql" -> "20261105000000". Anything else -> null. */
export function migrationVersion(file: string): string | null {
  const m = /^(\d{14})_[\w-]+\.sql$/.exec(file);
  return m ? m[1] : null;
}

export function buildHealth(i: HealthInputs): Health {
  const applied = i.applied && "versions" in i.applied ? [...i.applied.versions].sort() : null;
  const error = i.applied && "error" in i.applied ? i.applied.error : null;
  const expected = i.expected ? [...i.expected].sort() : null;
  const pending = applied && expected ? expected.filter((v) => !applied.includes(v)) : null;

  const reachable = !i.supabaseConfigured ? null : error !== "unreachable";
  const degraded = i.supabaseConfigured && (error !== null || (pending !== null && pending.length > 0));

  return {
    status: degraded ? "degraded" : "ok",
    supabase: { configured: i.supabaseConfigured, reachable },
    data: i.supabaseConfigured ? "live" : "demo",
    ai: { enabled: i.aiEnabled },
    migrations: { applied, expected, pending, error },
  };
}
