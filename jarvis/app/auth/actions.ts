"use server";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signOut() {
  if (isSupabaseConfigured()) {
    const db = await createSupabaseServerClient();
    await db.auth.signOut();
  }
  redirect("/login?signed_out=1");
}
