"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/validation/form-state";

export function MilestoneFormView({
  action,
  goalId,
  disabled,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  goalId: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const e = state.errors ?? {};
  return (
    <form action={formAction} className="inline-form" noValidate>
      <fieldset disabled={disabled || pending}>
        <input type="hidden" name="goal_id" value={goalId} />
        <input name="title" className="field" placeholder="New milestone" aria-label="Milestone title" required />
        <input name="due_date" type="date" className="field" aria-label="Milestone due date" />
        <button type="submit" className="btn-add">{pending ? "Adding..." : "Add"}</button>
      </fieldset>
      {(e.title || e.due_date || state.message) && (
        <span className={e.title || e.due_date ? "fld-error" : "form-msg"} role="status">
          {e.title ?? e.due_date ?? state.message}
        </span>
      )}
    </form>
  );
}
