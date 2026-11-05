"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/lib/validation/form-state";
import { Field } from "./Field";

export interface GoalDefaults {
  title?: string;
  description?: string | null;
  success_definition?: string | null;
  domain_id?: string | null;
  metric_type?: "percent" | "count" | "binary" | "value";
  target_value?: number | null;
  unit?: string | null;
  start_date: string;
  target_date?: string | null;
  priority?: number;
}

export function GoalFormView({
  action,
  defaults,
  domains,
  submitLabel,
  disabled,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  defaults: GoalDefaults;
  domains: { id: string; name: string }[];
  submitLabel: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [metric, setMetric] = useState(defaults.metric_type ?? "percent");
  const e = state.errors ?? {};

  return (
    <form action={formAction} className="form" noValidate>
      <fieldset disabled={disabled || pending}>
        <Field label="Title" name="title" error={e.title}>
          <input id="title" name="title" className="field" required defaultValue={defaults.title ?? ""} />
        </Field>

        <div className="form-row">
          <Field label="Domain" name="domain_id" error={e.domain_id}>
            <select id="domain_id" name="domain_id" className="field" defaultValue={defaults.domain_id ?? ""}>
              <option value="">None</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Or a new domain" name="new_domain" error={e.new_domain}>
            <input id="new_domain" name="new_domain" className="field" placeholder="e.g. Fitness" />
          </Field>
        </div>

        <div className="form-row">
          <Field label="Metric" name="metric_type" error={e.metric_type}>
            <select
              id="metric_type"
              name="metric_type"
              className="field"
              value={metric}
              onChange={(ev) => setMetric(ev.target.value as GoalDefaults["metric_type"] & string)}
            >
              <option value="percent">Percent</option>
              <option value="count">Count</option>
              <option value="value">Value</option>
              <option value="binary">Done or not</option>
            </select>
          </Field>
          {metric !== "binary" && (
            <Field label="Target" name="target_value" error={e.target_value} hint={metric === "percent" ? "Defaults to 100" : undefined}>
              <input id="target_value" name="target_value" type="number" min="0" step="any" className="field" defaultValue={defaults.target_value ?? ""} />
            </Field>
          )}
          {(metric === "count" || metric === "value") && (
            <Field label="Unit" name="unit" error={e.unit} hint={metric === "count" ? "Capture matches on this word: \"3 applications\"" : undefined}>
              <input id="unit" name="unit" className="field" placeholder="applications" defaultValue={defaults.unit ?? ""} />
            </Field>
          )}
        </div>

        <div className="form-row">
          <Field label="Start" name="start_date" error={e.start_date}>
            <input id="start_date" name="start_date" type="date" className="field" required defaultValue={defaults.start_date} />
          </Field>
          <Field label="Deadline" name="target_date" error={e.target_date} hint="Pace needs a deadline">
            <input id="target_date" name="target_date" type="date" className="field" defaultValue={defaults.target_date ?? ""} />
          </Field>
          <Field label="Priority" name="priority" error={e.priority}>
            <select id="priority" name="priority" className="field" defaultValue={String(defaults.priority ?? 3)}>
              {[1, 2, 3, 4, 5].map((p) => (
                <option key={p} value={p}>P{p}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="What done means" name="success_definition" error={e.success_definition}>
          <input id="success_definition" name="success_definition" className="field" defaultValue={defaults.success_definition ?? ""} />
        </Field>
        <Field label="Notes" name="description" error={e.description}>
          <textarea id="description" name="description" className="field" rows={2} defaultValue={defaults.description ?? ""} />
        </Field>

        <div className="form-actions">
          <button type="submit" className="btn-primary inline">{pending ? "Saving..." : submitLabel}</button>
          {state.message && <span className="form-msg" role="status">{state.message}</span>}
        </div>
      </fieldset>
    </form>
  );
}
