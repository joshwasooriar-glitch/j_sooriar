import "server-only";
import { z } from "zod";
import type { SupabaseServerClient } from "@/lib/supabase/server";

/**
 * Writes for goals, milestones, tasks and domains. Every call runs as the
 * signed-in user, so RLS scopes it. Completion and reopening are not here:
 * they are ledger operations in lib/db/ledger.ts.
 */

type Db = SupabaseServerClient;

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

const IdRow = z.object({ id: z.string() });

export async function listDomains(db: Db) {
  const { data, error } = await db.from("domains").select("id, name").order("sort_order").order("name");
  check(error);
  return z.array(z.object({ id: z.string(), name: z.string() })).parse(data ?? []);
}

/** Existing domain by name, or a new one. */
export async function ensureDomain(db: Db, userId: string, name: string): Promise<string> {
  const { data, error } = await db
    .from("domains")
    .upsert({ user_id: userId, name: name.trim() }, { onConflict: "user_id,name" })
    .select("id")
    .single();
  check(error);
  return IdRow.parse(data).id;
}

export async function createGoal(db: Db, userId: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await db.from("goals").insert({ ...row, user_id: userId, source: "user" }).select("id").single();
  check(error);
  return IdRow.parse(data).id;
}

export async function updateGoal(db: Db, id: string, row: Record<string, unknown>): Promise<void> {
  const { error } = await db.from("goals").update(row).eq("id", id);
  check(error);
}

export async function setGoalStatus(db: Db, id: string, status: string): Promise<void> {
  const { error } = await db.from("goals").update({ status }).eq("id", id);
  check(error);
}

export async function createMilestone(db: Db, row: Record<string, unknown>): Promise<void> {
  const { error } = await db.from("milestones").insert({ ...row, source: "user" });
  check(error);
}

export async function setMilestoneStatus(db: Db, id: string, status: string): Promise<void> {
  const completed_at = status === "completed" ? new Date().toISOString() : null;
  const { error } = await db.from("milestones").update({ status, completed_at }).eq("id", id);
  check(error);
}

export async function createTask(db: Db, userId: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await db.from("tasks").insert({ ...row, user_id: userId, source: "user" }).select("id").single();
  check(error);
  return IdRow.parse(data).id;
}

/** Edits only an open task. Done and cancelled tasks are history; reopen first. */
export async function updateOpenTask(db: Db, id: string, row: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await db
    .from("tasks")
    .update(row)
    .eq("id", id)
    .in("status", ["todo", "in_progress", "blocked"])
    .select("id");
  check(error);
  return (data ?? []).length > 0;
}

export async function cancelTask(db: Db, id: string): Promise<void> {
  const { error } = await db.from("tasks").update({ status: "cancelled" }).eq("id", id).neq("status", "done");
  check(error);
}

/** The latest task_completed event for a task that has not been reversed, if any. */
export async function latestCompletion(db: Db, taskId: string): Promise<number | null> {
  const { data, error } = await db
    .from("activity_events")
    .select("id, event_type, meta")
    .eq("task_id", taskId)
    .in("event_type", ["task_completed", "reversal"])
    .order("id", { ascending: false });
  check(error);
  const rows = z
    .array(z.object({ id: z.coerce.number(), event_type: z.string(), meta: z.record(z.unknown()).catch({}) }))
    .parse(data ?? []);
  const reversed = new Set(rows.filter((r) => r.event_type === "reversal").map((r) => String(r.meta.reverses_event_id)));
  const open = rows.find((r) => r.event_type === "task_completed" && !reversed.has(String(r.id)));
  return open?.id ?? null;
}
