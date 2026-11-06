import { NextResponse, type NextRequest } from "next/server";
import { ChatRequest, handleChat } from "@/lib/chat/chat";
import { loadRequestContext } from "@/lib/chat/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = ChatRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Expected { message: string } of 1 to 2000 characters." }, { status: 400 });
  }

  const ctx = await loadRequestContext(new Date());
  if (ctx === "unauthorized") return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  try {
    const res = await handleChat(body.data, ctx);
    return NextResponse.json({ ...res, demo: ctx.isDemo });
  } catch (err) {
    // Details go to the server log only; response bodies never carry internals.
    console.error("chat failed", err);
    return NextResponse.json({ error: "Chat failed. Nothing was changed." }, { status: 500 });
  }
}
