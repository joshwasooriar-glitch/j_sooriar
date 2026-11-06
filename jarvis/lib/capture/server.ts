import "server-only";
import { LedgerError, completeTask, logGoalProgress, undoUntil } from "@/lib/db/ledger";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { planCapture, type CaptureContext } from "./plan";
import type { CaptureRequest, CaptureResponse } from "./protocol";

export interface CaptureServerContext {
  /** Null in demo mode: plans are shown, nothing is written. */
  db: SupabaseServerClient | null;
  capture: CaptureContext;
}

function fmtQty(n: number): string {
  return Number(n.toFixed(2)).toString();
}

/**
 * Executes a capture request. Every write goes through a ledger function that
 * re-checks ownership and state in the database, so a stale or forged id from
 * the client can never write to someone else's data.
 */
export async function runCapture(req: CaptureRequest, ctx: CaptureServerContext): Promise<CaptureResponse> {
  try {
    if (req.action === "plan") {
      const plan = planCapture(req.text, ctx.capture);
      switch (plan.kind) {
        case "complete_task":
          return complete(plan.taskId, `capture:${plan.reason}`, req.text, ctx);
        case "task_picker":
          return { kind: "task_picker", reply: plan.question, options: plan.options };
        case "confirm_count":
          return { kind: "confirm_count", reply: plan.question, options: plan.options, text: req.text };
        case "no_match":
          return { kind: "no_match", reply: plan.reply };
      }
    }

    if (req.action === "complete_task") {
      return complete(req.task_id, "capture:picked", req.text ?? null, ctx);
    }

    // log_progress
    const option = ctx.capture.countGoals.find((c) => c.goal.id === req.goal_id);
    if (!ctx.db) {
      return {
        kind: "demo",
        reply: `Demo data: I would have logged ${fmtQty(req.quantity)} ${option?.goal.unit ?? ""} to ${option?.goal.title ?? "that goal"}. Nothing was written.`,
      };
    }
    const r = await logGoalProgress(ctx.db, req.goal_id, req.quantity, req.ref, req.text ?? null);
    const g = option?.goal;
    const resulting = (option?.current ?? 0) + (r.duplicate ? 0 : r.quantity);
    const of = g?.target_value ? ` of ${fmtQty(Number(g.target_value))}` : "";
    return {
      kind: "logged",
      reply: `Logged ${fmtQty(r.quantity)} ${g?.unit ?? ""} to ${g?.title ?? "the goal"}: now ${fmtQty(resulting)}${of}.`.replace(/\s+/g, " "),
      eventId: r.event_id,
      undoUntil: undoUntil(r.created_at),
    };
  } catch (err) {
    if (err instanceof LedgerError) return { kind: "error", reply: err.message, code: err.code };
    throw err;
  }
}

async function complete(
  taskId: string,
  via: string,
  text: string | null,
  ctx: CaptureServerContext,
): Promise<CaptureResponse> {
  if (!ctx.db) {
    const t = ctx.capture.openTasks.find((x) => x.id === taskId);
    return { kind: "demo", reply: `Demo data: I would have marked "${t?.title ?? "that task"}" complete. Nothing was written.` };
  }
  const r = await completeTask(ctx.db, taskId, via, text);
  return { kind: "completed", reply: `Marked "${r.title}" complete.`, eventId: r.event_id, undoUntil: undoUntil(r.created_at) };
}
