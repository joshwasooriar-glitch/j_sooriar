/**
 * Shared helpers for end-to-end tests against a local Supabase stack and a
 * running app. Real GoTrue magic-link sign-in, real Postgres reads.
 *
 *   npx supabase start
 *   npm run build && npx next start -p 3100 -H 127.0.0.1 &
 *   npm run test:e2e
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY from .env.local (npm script uses --env-file).
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

export const APP = process.env.APP_URL ?? "http://127.0.0.1:3100";
export const API = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
export const INBUCKET = process.env.INBUCKET_URL ?? "http://127.0.0.1:54324";
export const DB = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const require = createRequire(process.env.PLAYWRIGHT_PATH ?? "/opt/node22/lib/node_modules/");
export const { chromium } = require("playwright");

/** One value from Postgres, as text. */
export function sql(q) {
  return execFileSync("psql", [DB, "-X", "-At", "-c", q], { encoding: "utf8" }).trim();
}

export function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

export async function newUser(prefix = "e2e") {
  if (!SERVICE) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required (put it in .env.local).");
  const email = `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
  const r = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
    body: JSON.stringify({ email, email_confirm: true }),
  });
  const u = await r.json();
  if (!r.ok) throw new Error(`Could not create user: ${JSON.stringify(u)}`);
  return { email, id: u.id };
}

export async function signIn(page, email) {
  await page.goto(`${APP}/login`);
  await page.fill('input[name="email"]', email);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/login\?sent=1/);
  const box = email.split("@")[0];
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${INBUCKET}/api/v1/mailbox/${box}`)).json();
    if (list.length) {
      const msg = await (await fetch(`${INBUCKET}/api/v1/mailbox/${box}/${list.at(-1).id}`)).json();
      const link = (msg.body.text.match(/https?:\/\/\S+verify\S+/) ?? [])[0]?.replace(/[)>\]]+$/, "");
      if (link) {
        await page.goto(link);
        await page.waitForURL(`${APP}/`);
        return;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("No magic link arrived.");
}

/** A signed-in browser page for a fresh user. */
export async function signedInPage(prefix) {
  const user = await newUser(prefix);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await signIn(page, user.email);
  return { browser, page, user };
}
