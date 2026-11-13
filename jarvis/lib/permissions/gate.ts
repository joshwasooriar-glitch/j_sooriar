/**
 * The permission gate (CLAUDE.md invariant 8). Every action JARVIS takes on
 * its own goes through runAction.
 *
 * - Level 0 and 1 run.
 * - Level 2 runs and is written to audit_log.
 * - Level 3 and 4 run only with a UI confirmation for this exact action and
 *   target. Without one, nothing runs and a 'denied' audit_log row is written
 *   before returning. If that row cannot be written, the call throws: a refusal
 *   that leaves no trace is not acceptable either.
 */

import { redeem } from "./confirm";
import { isAudited, levelOf, needsConfirmation, type ActionName, type PermissionLevel } from "./levels";

export interface AuditRow {
  user_id: string;
  action: string;
  reason: string | null;
  tool: string | null;
  target_table: string | null;
  target_id: string | null;
  permission_level: PermissionLevel;
  result: "success" | "failed" | "denied";
  undo_payload: unknown;
  cost_cents: number;
}

export interface GateContext {
  userId: string;
  writeAudit: (row: AuditRow) => Promise<void>;
}

export interface ActionRequest {
  action: ActionName;
  reason: string;
  tool?: string;
  target?: { table: string; id: string };
  undo?: unknown;
}

export type ActionOutcome<T> =
  | { status: "done"; level: PermissionLevel; result: T }
  | { status: "refused"; level: PermissionLevel; why: string };

export async function runAction<T>(
  ctx: GateContext,
  req: ActionRequest,
  confirmation: unknown,
  execute: () => Promise<T>,
): Promise<ActionOutcome<T>> {
  const level = levelOf(req.action);
  const targetId = req.target?.id ?? null;
  const row = (result: AuditRow["result"], reason: string): AuditRow => ({
    user_id: ctx.userId,
    action: req.action,
    reason,
    tool: req.tool ?? null,
    target_table: req.target?.table ?? null,
    target_id: targetId,
    permission_level: level,
    result,
    undo_payload: req.undo ?? null,
    cost_cents: 0,
  });

  if (needsConfirmation(level)) {
    const why = redeem(confirmation, req.action, targetId);
    if (why) {
      await ctx.writeAudit(row("denied", `Refused: level ${level} needs explicit UI confirmation (${why}). ${req.reason}`));
      return { status: "refused", level, why };
    }
  }

  let result: T;
  try {
    result = await execute();
  } catch (err) {
    if (isAudited(level)) await ctx.writeAudit(row("failed", req.reason));
    throw err;
  }
  if (isAudited(level)) await ctx.writeAudit(row("success", req.reason));
  return { status: "done", level, result };
}
