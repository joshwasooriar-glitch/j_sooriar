import { NextResponse, type NextRequest } from "next/server";
import { requestOrigin } from "@/lib/http/origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Exchanges the magic link code for a session cookie, then lands on the dashboard. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = requestOrigin(request.headers, url.origin);
  const code = url.searchParams.get("code");

  if (code) {
    const db = await createSupabaseServerClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/", origin));
  }
  return NextResponse.redirect(new URL("/login?error=callback", origin));
}
