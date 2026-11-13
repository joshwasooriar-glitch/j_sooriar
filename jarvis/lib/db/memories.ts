import "server-only";
import { z } from "zod";
import type { MemoryLine } from "@/lib/ai/context";
import type { SupabaseServerClient } from "@/lib/supabase/server";

const Row = z.object({
  kind: z.string(),
  content: z.string(),
  importance: z.coerce.number(),
  source_type: z.enum(["stated", "observed", "derived", "external"]),
  confidence: z.coerce.number().nullable(),
  source: z.string().nullable(),
});

/**
 * Profile and preference memories for the context packet. Retrieved by SQL on
 * kind, never by vector search (ARCHITECTURE section 3). Sensitive rows stay out.
 * Provenance comes along: the context builder decides how each one may be used.
 */
export async function loadPromptMemories(db: SupabaseServerClient): Promise<MemoryLine[]> {
  const { data, error } = await db
    .from("memories")
    .select("kind, content, importance, source_type, confidence, source")
    .in("kind", ["profile", "preference"])
    .eq("sensitive", false)
    .order("importance", { ascending: false })
    .limit(12);
  if (error) throw error;
  return z.array(Row).parse(data ?? []);
}
