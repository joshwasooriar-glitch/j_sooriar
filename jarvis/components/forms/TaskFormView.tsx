"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/validation/form-state";
import { Field } from "./Field";

export interface TaskDefaults {
  title?: string;
  notes?: string | null;
  goal_id?: string | null;
  milestone_id?: string | null;
  priority?: number;
  /** datetime-local value in the user's timezone. */
  due_at?: string | null;
  estimate_minutes?: number | null;
  scale?: "micro" | "macro";
  status?: "todo" | "in_progress" | "blocked";
}

export function TaskFormView({
  action,
  defaults,
  goals,
  milestones,
  submitLabel,
  disabled,
  showStatus,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  defaults: TaskDefaults;
  goals: { id: string; title: string }[];
  milestones: { id: string; title: string; goal_id: string }[];
  submitLabel: string;
  disabled?: boolean;
  showStatus?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const e = state.errors ?? {};

  return (
    <form action={formAction} className="form" noValidate>
      <fieldset disabled={disabled || pending}>
        <Field label="Title" name="title" error={e.title} hint="Lead with a verb: capture matches on the words after it">
          <input id="title" name="title" className="field" required defaultValue={defaults.title ?? ""} />
        </Field>

        <div className="form-row">
          <Field label="Goal" name="goal_id" error={e.goal_id}>
            <select id="goal_id" name="goal_id" className="field" defaultValue={defaults.goal_id ?? ""}>
              <option value="">None</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </select>
          </Field>
          <Field label="Milestone" name="milestone_id" error={e.milestone_id}>
            <select id="milestone_id" name="milestone_id" className="field" defaultValue={defaults.milestone_id ?? ""}>
              <option value="">None</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="form-row">
          <Field label="Priority" name="priority" error={e.priority}>
            <select id="priority" name="priority" className="field" defaultValue={String(defaults.priority ?? 3)}>
              {[1, 2, 3, 4, 5].map((p) => (
                <option key={p} value={p}>P{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Due" name="due_at" error={e.due_at}>
            <input id="due_at" name="due_at" type="datetime-local" className="field" defaultValue={defaults.due_at ?? ""} />
          </Field>
          <Field label="Estimate (min)" name="estimate_minutes" error={e.estimate_minutes}>
            <input id="estimate_minutes" name="estimate_minutes" type="number" min="1" max="1440" className="field" defaultValue={defaults.estimate_minutes ?? ""} />
          </Field>
        </div>

        <div className="form-row">
          <Field label="Size" name="scale" error={e.scale}>
            <select id="scale" name="scale" className="field" defaultValue={defaults.scale ?? "micro"}>
              <option value="micro">Next action</option>
              <option value="macro">Container</option>
            </select>
          </Field>
          {showStatus && (
            <Field label="Status" name="status" error={e.status}>
              <select id="status" name="status" className="field" defaultValue={defaults.status ?? "todo"}>
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="blocked">Blocked</option>
              </select>
            </Field>
          )}
        </div>

        <Field label="Notes" name="notes" error={e.notes}>
          <textarea id="notes" name="notes" className="field" rows={3} defaultValue={defaults.notes ?? ""} />
        </Field>

        <div className="form-actions">
          <button type="submit" className="btn-primary inline">{pending ? "Saving..." : submitLabel}</button>
          {state.message && <span className="form-msg" role="status">{state.message}</span>}
        </div>
      </fieldset>
    </form>
  );
}
