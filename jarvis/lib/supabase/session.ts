import "server-only";
import { redirect } from "next/navigation";
import type { DashboardSnapshot } from "@/lib/dashboard/snapshot";
import { loadDashboardSnapshot } from "@/lib/db/dashboard";
import { demoSnapshot } from "@/lib/db/demo";
import { isSupabaseConfigured } from "./config";
import { createSupabaseServerClient, type SupabaseServerClient } from "./server";

export interface Session {
  db: SupabaseServerClient;
  userId: string;
}

/**
 * The signed-in user, or null in demo mode (no Supabase configured).
 * Redirects to /login when Supabase is configured and nobody is signed in.
 */
export async function requireSession(): Promise<Session | null> {
  if (!isSupabaseConfigured()) return null;
  const db = await createSupabaseServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  return { db, userId: user.id };
}

/** One read path for every page: the same snapshot the dashboard uses, or the demo fixture. */
export async function loadPageData(now: Date): Promise<{ session: Session | null; snap: DashboardSnapshot }> {
  const session = await requireSession();
  const snap = session ? await loadDashboardSnapshot(session.db, session.userId, now) : demoSnapshot(now);
  return { session, snap };
}
