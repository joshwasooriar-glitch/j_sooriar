#!/usr/bin/env node
/**
 * Real-service acceptance run against a local Supabase stack.
 *
 * Drives a real browser through the app (real GoTrue magic-link login, real
 * PostgREST, real Postgres functions) and, after every step, queries Postgres
 * directly so the evidence is database rows, not what the UI says.
 *
 * Prerequisites:
 *   npx supabase start                 (DB on 54322, API on 54321, Inbucket on 54324)
 *   .env.local pointing at it, then npm run build && npx next start -p 3100
 *   Playwright available (npm i -g playwright, or set PLAYWRIGHT_PATH)
 *
 *   SUPABASE_SERVICE_ROLE_KEY=<local service key> node scripts/acceptance-local.mjs
 *
 * For a hosted project, follow docs/ACCEPTANCE.md by hand: the magic link has
 * to come from a real inbox.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const APP = process.env.APP_URL ?? "http://127.0.0.1:3100";
const API = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const INBUCKET = process.env.INBUCKET_URL ?? "http://127.0.0.1:54324";
const DB = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.ACCEPT_EMAIL ?? `joshwa.accept.${Date.now()}@example.com`;
const OUT = process.env.EVIDENCE_DIR ?? "acceptance-evidence";

if (!SERVICE) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to create the test user.");
mkdirSync(OUT, { recursive: true });

const require = createRequire(process.env.PLAYWRIGHT_PATH ?? "/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");

let step = 0;
const log = (...a) => console.log(...a);
const sql = (q) => execFileSync("psql", [DB, "-X", "-A", "-F", " | ", "-P", "footer=off", "-c", q], { encoding: "utf8" }).trim();
const sqlValue = (q) => execFileSync("psql", [DB, "-X", "-At", "-c", q], { encoding: "utf8" }).trim();

async function stepDo(title, fn) {
  step++;
  log(`\n━━ STEP ${step}: ${title}`);
  try {
    await fn();
    log(`   PASS`);
  } catch (err) {
    log(`   FAIL: ${err.message}`);
    await page?.screenshot({ path: join(OUT, `fail-step-${step}.png`), fullPage: true }).catch(() => {});
    throw err;
  }
}
function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}
function evidence(label, query) {
  log(`   evidence: ${label}`);
  for (const line of sql(query).split("\n")) log(`     ${line}`);
}

// ------------------------------------------------------------------ setup

const created = await fetch(`${API}/auth/v1/admin/users`, {
  method: "POST",
  headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, email_confirm: true }),
});
const user = await created.json();
if (!created.ok) throw new Error(`Could not create test user: ${JSON.stringify(user)}`);
const UID = user.id;
log(`Test user ${EMAIL} (${UID}). App ${APP}. Started ${new Date().toISOString()}`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

let goalId, taskId, completionEventId, secondCompletionId;

// ------------------------------------------------------------------ steps

await stepDo("Sign in with a real magic link", async () => {
  await page.goto(`${APP}/`);
  expect(page.url().startsWith(`${APP}/login`), `expected a redirect to /login, got ${page.url()}`);
  await page.fill('input[name="email"]', EMAIL);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/login\?sent=1/);

  const box = EMAIL.split("@")[0];
  let link = null;
  for (let i = 0; i < 20 && !link; i++) {
    const list = await (await fetch(`${INBUCKET}/api/v1/mailbox/${box}`)).json();
    if (list.length) {
      const msg = await (await fetch(`${INBUCKET}/api/v1/mailbox/${box}/${list.at(-1).id}`)).json();
      link = (msg.body.text.match(/https?:\/\/\S+verify\S+/) ?? [])[0]?.replace(/[)>\]]+$/, "") ?? null;
    }
    if (!link) await new Promise((r) => setTimeout(r, 500));
  }
  expect(link, "no magic link arrived in the mailbox");
  log(`   magic link: ${link.replace(/token=[^&]+/, "token=…")}`);
  await page.goto(link);
  await page.waitForURL(`${APP}/`);
  const cookies = (await context.cookies()).filter((c) => c.name.startsWith("sb-"));
  expect(cookies.length > 0, "no Supabase session cookie after sign-in");
  log(`   signed in, session cookie: ${cookies.map((c) => c.name).join(", ")}`);
  evidence("profile created by the signup trigger", `select id, display_name, timezone from profiles where id = '${UID}'`);
});

await stepDo("Dashboard reads AI OFF, never $0.00 / $10.00", async () => {
  const pill = await page.textContent(".topbar .pill.ai-off");
  expect(pill?.includes("AI OFF"), `AI pill was ${pill}`);
  const top = await page.textContent(".topbar");
  expect(!top.includes("$0.00 / $10.00"), "top bar still shows a dollar budget");
  log(`   top bar pill: "${pill.trim()}"`);
  await page.screenshot({ path: join(OUT, "01-dashboard-empty.png"), fullPage: true });
});

await stepDo("Create a count goal", async () => {
  await page.goto(`${APP}/goals/new`);
  await page.fill("#title", "Land a SWE or data role");
  await page.fill("#new_domain", "Career");
  await page.selectOption("#metric_type", "count");
  await page.fill("#target_value", "60");
  await page.fill("#unit", "applications");
  const deadline = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  await page.fill("#target_date", deadline);
  await page.selectOption("#priority", "1");
  await page.click('form.form button[type="submit"]');
  await page.waitForURL(/\/goals\/[0-9a-f-]{36}$/);
  goalId = page.url().split("/").pop();
  evidence("goals row (no derived columns; current_value is the cache, 0)", `select id, title, metric_type, target_value, unit, target_date, priority, current_value from goals where id = '${goalId}'`);
  evidence("domain created inline", `select name from domains where user_id = '${UID}'`);
});

await stepDo("Create a task under the goal", async () => {
  await page.goto(`${APP}/tasks/new?goal=${goalId}`);
  const prefilled = await page.inputValue("#goal_id");
  expect(prefilled === goalId, "the ?goal= prefill did not select the goal");
  await page.fill("#title", "Build the auth flow");
  await page.selectOption("#priority", "1");
  await page.click('form.form button[type="submit"]');
  await page.waitForURL(/\/tasks\/[0-9a-f-]{36}$/);
  taskId = page.url().split("/").pop();
  evidence("tasks row", `select id, title, status, priority, goal_id from tasks where id = '${taskId}'`);
});

await stepDo('Complete it by capture: "I finished the auth flow"', async () => {
  await page.goto(`${APP}/`);
  await page.click("button.mode"); // Ask -> Log
  await page.fill('input[name="q"]', "I finished the auth flow");
  const t0 = Date.now();
  await page.press('input[name="q"]', "Enter");
  await page.waitForSelector(".ask-text.tone-good");
  const reply = await page.textContent(".ask-text.tone-good");
  log(`   reply after ${Date.now() - t0} ms: "${reply}"`);
  expect(reply === 'Marked "Build the auth flow" complete.', `unexpected reply ${reply}`);
  completionEventId = sqlValue(`select id from activity_events where task_id = '${taskId}' and event_type = 'task_completed' order by id desc limit 1`);
  evidence("ledger row written", `select id, event_type, task_id = '${taskId}' as for_task, quantity, xp, source, meta->>'via' as via from activity_events where id = ${completionEventId}`);
  evidence("task closed", `select status, completed_at is not null as has_completed_at from tasks where id = '${taskId}'`);
  evidence("prior status kept for undo", `select action, undo_payload from audit_log where action = 'complete_task' and target_id = '${taskId}'`);
  await page.screenshot({ path: join(OUT, "02-captured-with-undo.png") });
});

await stepDo("Undo it within 30 seconds", async () => {
  const btn = page.locator("button", { hasText: /^Undo \(\d+s\)$/ });
  log(`   button: "${await btn.textContent()}"`);
  await btn.click();
  await page.waitForSelector("text=Undone.");
  log(`   reply: "${(await page.textContent(".ask-reply p"))?.trim()}"`);
  evidence(
    "compensating row (negated, points at the original); original still present",
    `select id, event_type, quantity, xp, source, external_ref, meta->>'reverses_event_id' as reverses from activity_events where task_id = '${taskId}' order by id`,
  );
  evidence("task status restored", `select status, completed_at from tasks where id = '${taskId}'`);
  const status = sqlValue(`select status from tasks where id = '${taskId}'`);
  expect(status === "todo", `task status is ${status}, expected todo`);
});

await stepDo("Undo is refused after 30 seconds; the Activity Ledger reverses with no time limit", async () => {
  await page.goto(`${APP}/tasks/${taskId}`);
  await page.click('form button:has-text("Complete")');
  await page.waitForSelector(".status.s-done");
  secondCompletionId = sqlValue(`select id from activity_events where task_id = '${taskId}' and event_type = 'task_completed' order by id desc limit 1`);
  log(`   completed again from the task page: event #${secondCompletionId}. Waiting 31 s...`);
  await page.waitForTimeout(31_000);
  const late = await page.evaluate(async (id) => {
    const r = await fetch("/api/undo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event_id: Number(id) }) });
    return { status: r.status, body: await r.json() };
  }, secondCompletionId);
  log(`   /api/undo after 31 s -> HTTP ${late.status}: "${late.body.reply}"`);
  expect(late.status === 410 && late.body.code === "JV410", "late undo was not refused with JV410");

  await page.goto(`${APP}/activity`);
  const row = page.locator("li", { hasText: `#${secondCompletionId}` });
  await row.locator('button:has-text("Reverse")').click();
  await row.locator(`button:has-text("Reverse #${secondCompletionId}")`).click();
  await page.waitForURL(new RegExp(`/activity\\?reversed=${secondCompletionId}`));
  evidence("two completions, two reversals, nothing deleted", `select id, event_type, quantity, xp, meta->>'reverses_event_id' as reverses, meta->>'reason' as reason from activity_events where task_id = '${taskId}' order by id`);
  evidence("task restored again", `select status, completed_at from tasks where id = '${taskId}'`);
  await page.screenshot({ path: join(OUT, "03-activity-ledger.png"), fullPage: true });
});

await stepDo('Log count progress: "sent 3 applications", confirmed before writing', async () => {
  await page.goto(`${APP}/`);
  await page.click("button.mode");
  await page.fill('input[name="q"]', "sent 3 applications");
  await page.press('input[name="q"]', "Enter");
  const card = page.locator(".pick-btn.count");
  await card.waitFor();
  const shown = (await card.textContent()).replace(/\s+/g, " ").trim();
  log(`   confirmation shown: "${shown}"`);
  const before = sqlValue(`select count(*) from activity_events where goal_id = '${goalId}' and event_type = 'goal_progress'`);
  expect(before === "0", "something was written before confirming");
  expect(shown.includes("Land a SWE or data role") && shown.includes("+3 applications") && shown.includes("0 → 3 of 60 (5%)"), "confirmation is missing goal, quantity or resulting progress");
  await page.screenshot({ path: join(OUT, "04-count-confirm.png") });
  await card.click();
  await page.waitForSelector(".ask-text.tone-good");
  log(`   reply: "${await page.textContent(".ask-text.tone-good")}"`);
  evidence("goal_progress row", `select id, event_type, quantity, xp, source, external_ref like 'progress:%' as idempotency_ref from activity_events where goal_id = '${goalId}' and event_type = 'goal_progress'`);
  evidence("goal value from the ledger", `select sum(quantity) as ledger_value from activity_events where goal_id = '${goalId}'`);
});

await stepDo("Run a focus block (one event on Stop)", async () => {
  await page.goto(`${APP}/`);
  await page.click('.sidebar button:has-text("Start focus block")');
  const atStart = sqlValue(`select count(*) from activity_events where user_id = '${UID}' and event_type = 'focus_session'`);
  expect(atStart === "0", "Start wrote an event; only Stop may");
  log("   started; nothing written. Waiting 62 s...");
  await page.waitForTimeout(62_000);
  const label = await page.textContent(".sidebar .btn-primary.running");
  log(`   button before stop: "${label}"`);
  await page.click(".sidebar .btn-primary.running");
  await page.waitForSelector(".sidebar .focus-result");
  log(`   reply: "${(await page.textContent(".sidebar .focus-result span"))?.trim()}"`);
  evidence("exactly one focus_session row", `select id, event_type, quantity, xp, meta->>'minutes' as minutes, meta->>'capped' as capped, meta->>'elapsed_ms' as elapsed_ms from activity_events where user_id = '${UID}' and event_type = 'focus_session'`);
  await page.screenshot({ path: join(OUT, "05-dashboard-after.png"), fullPage: true });
});

await stepDo("Sign out", async () => {
  await page.click('.topbar button:has-text("Sign out")');
  await page.waitForURL(/\/login\?signed_out=1/);
  await page.goto(`${APP}/`);
  expect(page.url().startsWith(`${APP}/login`), `after sign out / went to ${page.url()}`);
  const left = (await context.cookies()).filter((c) => c.name.startsWith("sb-") && c.value);
  log(`   / now redirects to ${new URL(page.url()).pathname}; session cookies left: ${left.length}`);
});

// ------------------------------------------------------------------ summary

log("\n━━ FINAL LEDGER FOR THE TEST USER");
log(sql(`select id, event_type, quantity, xp, source, coalesce(meta->>'reverses_event_id', '') as reverses from activity_events where user_id = '${UID}' order by id`));
log("\n━━ AUDIT LOG");
log(sql(`select id, action, target_table, permission_level, result from audit_log where user_id = '${UID}' order by id`));
log(`\nmodel_runs rows for this user (AI off, expect 0): ${sqlValue(`select count(*) from model_runs where user_id = '${UID}'`)}`);
log(`browser page errors: ${pageErrors.length ? pageErrors.join(" | ") : "none"}`);
log(`\nALL ${step} STEPS PASSED  ${new Date().toISOString()}`);

await browser.close();
