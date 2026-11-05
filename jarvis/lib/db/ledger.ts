import "server-only";
import { z } from "zod";
import type { SupabaseServerClient } from "@/lib/supabase/server";

/**
 * Typed calls to the ledger functions in
 * supabase/migrations/20261105000000_ledger_functions.sql. Every ledger write
 * in the app goes through one of these; nothing writes activity_events
 * directly.
 */

/** The Undo toast window. Enforced by the database clock, not the browser. */
export const UNDO_WINDOW_SECONDS = 30;

export class LedgerError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LedgerError";
  }
}

/** User-facing text for each custom SQLSTATE. Internals stay in the server log. */
const MESSAGES: Record<string, string> = {
  JV401: "You are signed out. Sign in and try again.",
  JV404: "That item was not found, or it is not yours.",
  JV409: "That was already done.",
  JV410: `The ${UNDO_WINDOW_SECONDS} second undo window has passed. You can still reverse it from the Activity Ledger.`,
  JV422: "That request was not valid.",
};

function fail(error: { code?: string; message: string }): never {
  const code = error.code ?? "unknown";
  throw new LedgerError(code, MESSAGES[code] ?? "The ledger write failed. Nothing was changed.");
}

const num = z.coerce.number();

const Completed = z.object({ event_id: num, task_id: z.string(), title: z.string(), created_at: z.string() });
const Reversed = z.object({
  reversal_event_id: num,
  reversed_event_id: num,
  reversed_event_type: z.string(),
  restored_task_status: z.string().nullable(),
});
const Logged = z.object({ event_id: num, goal_id: z.string(), quantity: num, created_at: z.string(), duplicate: z.boolean() });
const Focus = z.object({ event_id: num, minutes: num, capped: z.boolean(), created_at: z.string(), duplicate: z.boolean() });

export async function completeTask(db: SupabaseServerClient, taskId: string, via: string, text: string | null) {
  const { data, error } = await db.rpc("complete_task", { p_task_id: taskId, p_via: via, p_text: text });
  if (error) fail(error);
  return Completed.parse(data);
}

/** maxAgeSeconds: UNDO_WINDOW_SECONDS for the toast, null for the Activity Ledger. */
export async function reverseEvent(
  db: SupabaseServerClient,
  eventId: number,
  maxAgeSeconds: number | null,
  reason: "undo" | "ledger",
) {
  const { data, error } = await db.rpc("reverse_activity_event", {
    p_event_id: eventId,
    p_max_age_seconds: maxAgeSeconds,
    p_reason: reason,
  });
  if (error) fail(error);
  return Reversed.parse(data);
}

export async function logGoalProgress(
  db: SupabaseServerClient,
  goalId: string,
  quantity: number,
  ref: string,
  text: string | null,
) {
  const { data, error } = await db.rpc("log_goal_progress", {
    p_goal_id: goalId,
    p_quantity: quantity,
    p_ref: ref,
    p_text: text,
  });
  if (error) fail(error);
  return Logged.parse(data);
}

export async function logFocusSession(db: SupabaseServerClient, elapsedMs: number, ref: string) {
  const { data, error } = await db.rpc("log_focus_session", { p_elapsed_ms: Math.round(elapsedMs), p_ref: ref });
  if (error) fail(error);
  return Focus.parse(data);
}

/** When the toast's Undo stops being accepted, from the row's database timestamp. */
export function undoUntil(createdAt: string): string {
  return new Date(new Date(createdAt).getTime() + UNDO_WINDOW_SECONDS * 1000).toISOString();
}
