"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { LedgerError, reverseEvent } from "@/lib/db/ledger";
import { requireSession } from "@/lib/supabase/session";

/**
 * Permanent reverse from the Activity Ledger. Same database function as the
 * Undo toast, with no time limit. Writes a compensating row; deletes nothing.
 */
export async function reverseEventAction(fd: FormData): Promise<void> {
  const session = await requireSession();
  const id = z.coerce.number().int().positive().parse(fd.get("id"));
  if (!session) redirect("/activity?msg=demo");

  let target = `/activity?reversed=${id}`;
  try {
    await reverseEvent(session.db, id, null, "ledger");
  } catch (err) {
    if (!(err instanceof LedgerError)) throw err;
    target = `/activity?error=${encodeURIComponent(err.code)}&id=${id}`;
  }
  revalidatePath("/");
  revalidatePath("/activity");
  revalidatePath("/tasks");
  redirect(target);
}
