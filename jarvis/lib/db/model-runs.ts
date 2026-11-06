import "server-only";
import type { RunRecorder } from "@/lib/ai/cost";
import type { SupabaseServerClient } from "@/lib/supabase/server";

/**
 * Writes model_runs rows as the signed-in user, so RLS applies. A failed
 * insert throws: withCostTracking treats an unrecorded call as a failed one.
 */
export function modelRunRecorder(db: SupabaseServerClient, userId: string): RunRecorder {
  return async (row) => {
    const { error } = await db.from("model_runs").insert({ ...row, user_id: userId });
    if (error) throw new Error(`model_runs insert failed: ${error.message}`);
  };
}
