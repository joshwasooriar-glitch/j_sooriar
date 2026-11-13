/**
 * The permission gate against a real database: a level 3 action without
 * confirmation is refused, and the 'denied' audit_log row is really stored,
 * read back through RLS as the same user.
 *
 * Needs the local Supabase stack and .env.local (service role key, to create a
 * throwaway user). Run: npm run test:permissions
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { auditWriter } from "../lib/db/audit";
import { runAction } from "../lib/permissions/gate";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY");

function check(label: string, ok: boolean, detail = "") {
  if (!ok) {
    console.error(`FAIL ${label} ${detail}`);
    process.exit(1);
  }
  console.log(`   ok  ${label}`);
}

const admin = createClient(url, service, { auth: { persistSession: false } });
const email = `perm-${randomUUID().slice(0, 8)}@test.local`;
const password = randomUUID();
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error) throw created.error;

const db = createClient(url, anon, { auth: { persistSession: false } });
const signedIn = await db.auth.signInWithPassword({ email, password });
if (signedIn.error) throw signedIn.error;
const userId = signedIn.data.user.id;

let ran = false;
const target = randomUUID();
const out = await runAction(
  { userId, writeAudit: auditWriter(db) },
  { action: "email.send", reason: "Reply to recruiter", tool: "gmail", target: { table: "drafts", id: target } },
  null,
  async () => {
    ran = true;
  },
);

console.log("== level 3 action, no confirmation");
check("it is refused", out.status === "refused" && out.level === 3, JSON.stringify(out));
check("the action did not run", !ran);

const { data, error } = await db.from("audit_log").select("action, permission_level, result, tool, target_id, reason").eq("user_id", userId);
check("audit_log is readable as the user", !error, error?.message);
check("exactly one audit_log row was written", data?.length === 1, JSON.stringify(data));
const row = data![0];
check("it records action email.send, level 3, result denied, the tool and the target",
  row.action === "email.send" && row.permission_level === 3 && row.result === "denied" && row.tool === "gmail" && row.target_id === target,
  JSON.stringify(row));
check("its reason says confirmation was missing", /needs explicit UI confirmation/.test(row.reason ?? ""), row.reason ?? "");

console.log("PERMISSION TEST PASSED");
