import "server-only";
import { z } from "zod";
import type { MemoryLine } from "@/lib/ai/context";
import type { SupabaseServerClient } from "@/lib/supabase/server";

const Row = z.object({ kind: z.string(), content: z.string(), importance: z.coerce.number() });

/**
 * Profile and preference memories for the context packet. Retrieved by SQL on
 * kind, never by vector search (ARCHITECTURE section 3). Sensitive rows stay out.
 */
export async function loadPromptMemories(db: SupabaseServerClient): Promise<MemoryLine[]> {
  const { data, error } = await db
    .from("memories")
    .select("kind, content, importance")
    .in("kind", ["profile", "preference"])
    .eq("sensitive", false)
    .order("importance", { ascending: false })
    .limit(12);
  if (error) throw error;
  return z.array(Row).parse(data ?? []);
}
