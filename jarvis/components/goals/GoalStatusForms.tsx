import type { GoalStatus } from "@/lib/engine/types";

/**
 * The goal status vocabulary, one word per state, used by the UI and stored
 * as-is: the database check constraint, the engine types and the Zod enum all
 * say `completed`. The UI says "Completed" too, never "achieved".
 */
export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  abandoned: "Abandoned",
};

export interface Transition {
  to: GoalStatus;
  label: string;
  primary: boolean;
}

/** Which status changes a goal in `status` offers. Pure. */
export function goalTransitions(status: GoalStatus): Transition[] {
  const out: Transition[] = [];
  if (status !== "active") out.push({ to: "active", label: "Reactivate", primary: true });
  if (status === "active") out.push({ to: "paused", label: "Pause", primary: false });
  if (status !== "completed") out.push({ to: "completed", label: "Mark completed", primary: false });
  if (status !== "abandoned") out.push({ to: "abandoned", label: "Abandon", primary: false });
  return out;
}

/**
 * One form per transition, with the target status in a hidden input.
 *
 * Not one shared form with name/value on each button: when React submits a
 * server-action form from JavaScript, the clicked button's value never
 * reached FormData, so the action received status = null and threw a
 * ZodError (production digest 24741756). A hidden input is part of the form
 * itself, with or without JavaScript.
 */
export function GoalStatusForms({
  goalId,
  status,
  action,
  disabled,
}: {
  goalId: string;
  status: GoalStatus;
  action: (fd: FormData) => void | Promise<void>;
  disabled?: boolean;
}) {
  return (
    <div className="status-actions">
      <span className="status">{GOAL_STATUS_LABEL[status]}</span>
      {goalTransitions(status).map((t) => (
        <form key={t.to} action={action}>
          <input type="hidden" name="id" value={goalId} />
          <input type="hidden" name="status" value={t.to} />
          <button type="submit" className={t.primary ? "btn-add" : "link-btn"} disabled={disabled}>
            {t.label}
          </button>
        </form>
      ))}
    </div>
  );
}
