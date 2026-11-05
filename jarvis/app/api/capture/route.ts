import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { loadRequestContext } from "@/lib/chat/server";

export const dynamic = "force-dynamic";

const Body = z.object({ text: z.string().trim().min(1).max(1000) });

/**
 * Quick capture: "finished the auth flow", "applied to 3 jobs". Closes the
 * matched task or appends a ledger row. Rules first, the model only when the
 * rules cannot decide, and a question back when neither is sure.
 */
export async function POST(request: NextRequest) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Expected { text: string } of 1 to 1000 characters." }, { status: 400 });
  }

  const ctx = await loadRequestContext(new Date());
  if (ctx === "unauthorized") return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  try {
    const res = await ctx.capture(body.data.text);
    return NextResponse.json({ ...res, demo: ctx.isDemo });
  } catch (err) {
    console.error("capture failed", err);
    return NextResponse.json({ error: "Capture failed. Check the ledger before retrying." }, { status: 500 });
  }
}
