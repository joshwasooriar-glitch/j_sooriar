"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requestOrigin } from "@/lib/http/origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const Input = z.object({ email: z.string().trim().email() });

/** Sends a magic link. Single-user app, so there is no sign-up form. */
export async function sendMagicLink(formData: FormData) {
  const parsed = Input.safeParse({ email: formData.get("email") });
  if (!parsed.success) redirect("/login?error=invalid");

  const h = await headers();
  const origin = h.get("origin") ?? requestOrigin(h, "http://localhost:3000");

  const db = await createSupabaseServerClient();
  const { error } = await db.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${origin}/auth/callback`, shouldCreateUser: false },
  });

  redirect(error ? "/login?error=send" : "/login?sent=1");
}
