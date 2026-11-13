/**
 * Permission level of every action JARVIS can take on its own. PERMISSIONS.md
 * is the source; this table is how code enforces it.
 *
 * The level comes from here, never from the caller, so nothing upstream (a
 * model, a tool argument, retrieved content) can lower it. An action that is
 * not listed is treated as level 4.
 */

export type PermissionLevel = 0 | 1 | 2 | 3 | 4;

export const ACTION_LEVELS = {
  // 0: read
  "goals.read": 0,
  "tasks.read": 0,
  // 1: internal write
  "task.create": 1,
  "goal.log_progress": 1,
  "memory.write": 1,
  // 2: reversible external, logged
  "email.draft": 2,
  "calendar.block_personal": 2,
  // 3: external effect, confirm first
  "email.send": 3,
  "form.submit": 3,
  "calendar.move_shared": 3,
  "post.publish": 3,
  // 4: high consequence, confirm immediately before execution
  "purchase": 4,
  "data.delete": 4,
  "credential.change": 4,
  "application.submit": 4,
  "private_info.share": 4,
} as const satisfies Record<string, PermissionLevel>;

export type ActionName = keyof typeof ACTION_LEVELS;

export function levelOf(action: string): PermissionLevel {
  return Object.hasOwn(ACTION_LEVELS, action) ? ACTION_LEVELS[action as ActionName] : 4;
}

/** Level 3 and 4 need an explicit confirmation from the UI. */
export function needsConfirmation(level: PermissionLevel): boolean {
  return level >= 3;
}

/** Level 2 and above are written to audit_log. */
export function isAudited(level: PermissionLevel): boolean {
  return level >= 2;
}
