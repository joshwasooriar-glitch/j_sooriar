import { NextResponse, type NextRequest } from "next/server";
import { UndoRequest } from "@/lib/capture/protocol";
import { LedgerError, UNDO_WINDOW_SECONDS, reverseEvent } from "@/lib/db/ledger";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The Undo toast. Writes a compensating event through reverse_activity_event
 * with a 30 second limit measured on the database clock, so a browser cannot
 * extend it. After that, the Activity Ledger's reverse is the way back.
 */
export async function POST(request: NextRequest) {
  const body = UndoRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Expected { event_id: number }." }, { status: 400 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ kind: "demo", reply: "Demo data: nothing was written, so there is nothing to undo." });
  }

  const db = await createSupabaseServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  try {
    const r = await reverseEvent(db, body.data.event_id, UNDO_WINDOW_SECONDS, "undo");
    const restored = r.restored_task_status ? ` The task is back to ${r.restored_task_status.replace("_", " ")}.` : "";
    return NextResponse.json({ kind: "undone", reply: `Undone.${restored}`, reversalEventId: r.reversal_event_id });
  } catch (err) {
    if (err instanceof LedgerError) {
      return NextResponse.json({ kind: "error", reply: err.message, code: err.code }, { status: err.code === "JV410" ? 410 : 409 });
    }
    console.error("undo failed", err);
    return NextResponse.json({ error: "Undo failed. Nothing was changed." }, { status: 500 });
  }
}
