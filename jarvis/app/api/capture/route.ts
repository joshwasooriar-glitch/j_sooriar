import { NextResponse, type NextRequest } from "next/server";
import { CaptureRequest } from "@/lib/capture/protocol";
import { runCapture } from "@/lib/capture/server";
import { loadRequestContext } from "@/lib/chat/server";

export const dynamic = "force-dynamic";

/**
 * Capture. Deterministic: no model call on any path.
 *
 *   { action: "plan", text }                  match and, if certain, complete
 *   { action: "complete_task", task_id }      the picker's choice
 *   { action: "log_progress", goal_id, ... }  a confirmed count
 *
 * A bare { text } is accepted as "plan".
 */
export async function POST(request: NextRequest) {
  const raw: unknown = await request.json().catch(() => null);
  const withAction =
    raw && typeof raw === "object" && !("action" in raw) && "text" in raw ? { ...raw, action: "plan" } : raw;
  const body = CaptureRequest.safeParse(withAction);
  if (!body.success) {
    return NextResponse.json({ error: "Invalid capture request." }, { status: 400 });
  }

  const ctx = await loadRequestContext(new Date());
  if (ctx === "unauthorized") return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  try {
    const res = await runCapture(body.data, ctx.captureServer);
    return NextResponse.json({ ...res, demo: ctx.isDemo });
  } catch (err) {
    console.error("capture failed", err);
    return NextResponse.json({ error: "Capture failed. Check the Activity Ledger before retrying." }, { status: 500 });
  }
}
