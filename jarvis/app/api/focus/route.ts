import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { LedgerError, logFocusSession, undoUntil } from "@/lib/db/ledger";
import { focusOutcome } from "@/lib/focus";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Body = z.object({
  /** Monotonic elapsed time measured by the client. Capped at 4 hours by the database. */
  elapsed_ms: z.number().int().nonnegative().max(7 * 24 * 60 * 60 * 1000),
  /** One per session, so a repeated Stop writes one row. */
  ref: z.string().min(8).max(100),
});

/** Stop a focus block: writes exactly one focus_session event. */
export async function POST(request: NextRequest) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Expected { elapsed_ms, ref }." }, { status: 400 });

  const preview = focusOutcome(body.data.elapsed_ms);
  if (preview.kind === "too_short") {
    return NextResponse.json({ kind: "too_short", reply: "Under a minute, so nothing was recorded." });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ kind: "demo", reply: `Demo data: would record ${preview.minutes} minutes. Nothing was written.` });
  }

  const db = await createSupabaseServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  try {
    const r = await logFocusSession(db, body.data.elapsed_ms, body.data.ref);
    const reply = r.capped
      ? `Recorded ${r.minutes} minutes. It ran past 4 hours, so it was capped: probably left running.`
      : `Recorded a ${r.minutes} minute focus block.`;
    return NextResponse.json({ kind: "recorded", reply, minutes: r.minutes, capped: r.capped, eventId: r.event_id, undoUntil: undoUntil(r.created_at) });
  } catch (err) {
    if (err instanceof LedgerError) return NextResponse.json({ kind: "error", reply: err.message, code: err.code }, { status: 409 });
    console.error("focus failed", err);
    return NextResponse.json({ error: "Could not record the focus block." }, { status: 500 });
  }
}
