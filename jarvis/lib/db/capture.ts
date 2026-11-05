import "server-only";
import type { CapturePlan } from "@/lib/chat/capture";
import { XP_BY_EVENT } from "@/lib/chat/capture";
import type { SupabaseServerClient } from "@/lib/supabase/server";

export type CaptureWrite =
  | { outcome: "closed_task"; taskTitle: string }
  | { outcome: "already_done"; taskTitle: string }
  | { outcome: "logged"; eventType: string; quantity: number };

/**
 * Applies a close_task or log_event plan. Both append to activity_events,
 * the ledger; goal progress is recomputed from it on the next read, so
 * goals.current_value is not touched here (the nightly reconcile owns it).
 *
 * No multi-statement transactions over PostgREST, so the order is chosen so
 * a partial failure is visible rather than silent: the task is closed first,
 * and if the ledger insert then fails the task is reopened and the error
 * thrown.
 */
export async function applyCapturePlan(
  db: SupabaseServerClient,
  userId: string,
  plan: Extract<CapturePlan, { kind: "close_task" | "log_event" }>,
  text: string,
  now: Date,
): Promise<CaptureWrite> {
  const occurredAt = now.toISOString();

  if (plan.kind === "close_task") {
    const t = plan.task;
    const { data: closed, error: closeErr } = await db
      .from("tasks")
      .update({ status: "done", completed_at: occurredAt })
      .eq("id", t.id)
      .in("status", ["todo", "in_progress", "blocked"])
      .select("id, status");
    if (closeErr) throw closeErr;
    if (!closed || closed.length === 0) return { outcome: "already_done", taskTitle: t.title };

    const { error: evErr } = await db.from("activity_events").insert({
      user_id: userId,
      event_type: "task_completed",
      occurred_at: occurredAt,
      goal_id: t.goal_id,
      milestone_id: t.milestone_id,
      project_id: t.project_id,
      task_id: t.id,
      quantity: 0,
      xp: XP_BY_EVENT.task_completed,
      source: "manual",
      meta: { title: t.title, text, via: plan.via },
    });
    if (evErr) {
      await db.from("tasks").update({ status: t.status, completed_at: null }).eq("id", t.id);
      throw evErr;
    }

    // JARVIS closed something on the user's behalf: record what it did and how to undo it.
    const { error: auditErr } = await db.from("audit_log").insert({
      user_id: userId,
      action: "close_task",
      reason: `Capture matched "${text.slice(0, 200)}" by ${plan.via}`,
      tool: "capture",
      target_table: "tasks",
      target_id: t.id,
      permission_level: 1,
      result: "success",
      undo_payload: { status: t.status, completed_at: null },
    });
    // The user's action is already in the ledger, so a failed audit row is logged, not fatal.
    if (auditErr) console.error("audit_log insert failed", auditErr.message);

    return { outcome: "closed_task", taskTitle: t.title };
  }

  const { error } = await db.from("activity_events").insert({
    user_id: userId,
    event_type: plan.eventType,
    occurred_at: occurredAt,
    goal_id: plan.goalId,
    quantity: plan.quantity,
    xp: XP_BY_EVENT[plan.eventType],
    source: "manual",
    meta: { text, note: plan.note, via: plan.via },
  });
  if (error) throw error;
  return { outcome: "logged", eventType: plan.eventType, quantity: plan.quantity };
}
