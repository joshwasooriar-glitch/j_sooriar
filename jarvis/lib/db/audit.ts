import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditRow } from "@/lib/permissions/gate";

/** Writes one audit_log row as the signed-in user (RLS: own rows only). Throws on failure. */
export function auditWriter(db: SupabaseClient) {
  return async (row: AuditRow): Promise<void> => {
    const { error } = await db.from("audit_log").insert(row);
    if (error) throw new Error(`audit_log write failed: ${error.message}`);
  };
}
