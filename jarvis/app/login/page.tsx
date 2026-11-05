import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { sendMagicLink } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "That does not look like an email address.",
  send: "Could not send the link. Check that this email has an account.",
  callback: "That sign-in link is invalid or expired. Request a new one.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/");
  const { sent, error } = await searchParams;

  return (
    <div className="center-page">
      <div className="panel hud card">
        <div className="brand-mark" aria-hidden="true" />
        <h1>Sign in to JARVIS</h1>
        <p>A one-time link will be sent to your email.</p>
        <form action={sendMagicLink}>
          <input className="field" type="email" name="email" required autoComplete="email" placeholder="you@example.com" aria-label="Email" />
          <button className="btn-primary" type="submit">
            Send magic link
          </button>
        </form>
        {sent && <p className="msg tone-good">Link sent. Check your inbox.</p>}
        {error && <p className="msg tone-bad">{ERRORS[error] ?? "Something went wrong."}</p>}
      </div>
    </div>
  );
}
