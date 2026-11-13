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

/** Every goal form field, as the string its control holds. Mirrors GOAL_FIELDS in lib/validation/forms.ts. */
type GoalValues = {
  title: string;
  description: string;
  success_definition: string;
  domain_id: string;
  new_domain: string;
  metric_type: string;
  target_value: string;
  unit: string;
  start_date: string;
  target_date: string;
  priority: string;
};

/** The form's starting values as strings: what was just submitted, else the saved goal. */
export function goalFormValues(defaults: GoalDefaults, submitted?: Record<string, string>): GoalValues {
  const fromDefaults: GoalValues = {
    title: defaults.title ?? "",
    description: defaults.description ?? "",
    success_definition: defaults.success_definition ?? "",
    domain_id: defaults.domain_id ?? "",
    new_domain: "",
    metric_type: defaults.metric_type ?? "percent",
    target_value: defaults.target_value == null ? "" : String(defaults.target_value),
    unit: defaults.unit ?? "",
    start_date: defaults.start_date,
    target_date: defaults.target_date ?? "",
    priority: String(defaults.priority ?? 3),
  };
  if (!submitted) return fromDefaults;
  // A submitted form wins field by field, including fields cleared on purpose.
  // Fields the form did not render (unit on a percent goal) keep their default.
  const out = { ...fromDefaults };
  for (const k of Object.keys(out) as (keyof GoalValues)[]) if (k in submitted) out[k] = submitted[k];
  return out;
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
  const val = goalFormValues(defaults, state.values);
  const [metric, setMetric] = useState(val.metric_type);

  // React resets the form after every action. Remounting it per result makes
  // every control, selects included, start again from val (what was typed),
  // and the metric that decides which fields show follows it.
  const [seen, setSeen] = useState(state);
  const [generation, setGeneration] = useState(0);
  if (seen !== state) {
    setSeen(state);
    setGeneration((g) => g + 1);
    setMetric(val.metric_type);
  }

  return (
    <form key={generation} action={formAction} className="form" noValidate>
      <fieldset disabled={disabled || pending}>
        <GoalFields val={val} metric={metric} onMetric={setMetric} errors={state.errors ?? {}} domains={domains} />
        <div className="form-actions">
          <button type="submit" className="btn-primary inline">{pending ? "Saving..." : submitLabel}</button>
          {(state.message ?? state.errors?.form) && (
            <span className="form-msg" role="status">{state.message ?? state.errors?.form}</span>
          )}
        </div>
      </fieldset>
    </form>
  );
}

/** The fields alone, pure, so a test can render them with given values and errors. */
export function GoalFields({
  val,
  metric,
  onMetric,
  errors: e,
  domains,
}: {
  val: GoalValues;
  metric: string;
  onMetric: (m: string) => void;
  errors: Record<string, string>;
  domains: { id: string; name: string }[];
}) {
  return (
    <>
    <Field label="Title" name="title" error={e.title}>
      <input id="title" name="title" className="field" required defaultValue={val.title} />
    </Field>

    <div className="form-row">
      <Field label="Domain" name="domain_id" error={e.domain_id}>
        <select id="domain_id" name="domain_id" className="field" defaultValue={val.domain_id}>
          <option value="">None</option>
          {domains.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Or a new domain" name="new_domain" error={e.new_domain}>
        <input id="new_domain" name="new_domain" className="field" placeholder="e.g. Fitness" defaultValue={val.new_domain} />
      </Field>
    </div>

    <div className="form-row">
      <Field label="Metric" name="metric_type" error={e.metric_type}>
        <select
          id="metric_type"
          name="metric_type"
          className="field"
          value={metric}
          onChange={(ev) => onMetric(ev.target.value)}
        >
          <option value="percent">Percent</option>
          <option value="count">Count</option>
          <option value="value">Value</option>
          <option value="binary">Done or not</option>
        </select>
      </Field>
      {metric !== "binary" && (
        <Field label="Target" name="target_value" error={e.target_value} hint={metric === "percent" ? "Defaults to 100" : undefined}>
          <input id="target_value" name="target_value" type="number" min="0" step="any" className="field" defaultValue={val.target_value} />
        </Field>
      )}
      {(metric === "count" || metric === "value") && (
        <Field label="Unit" name="unit" error={e.unit} hint={metric === "count" ? "Capture matches this word or a word from the title: \"3 applications\"" : undefined}>
          <input id="unit" name="unit" className="field" placeholder="applications" defaultValue={val.unit} />
        </Field>
      )}
    </div>

    <div className="form-row">
      <Field label="Start" name="start_date" error={e.start_date}>
        <input id="start_date" name="start_date" type="date" className="field" required defaultValue={val.start_date} />
      </Field>
      <Field label="Deadline" name="target_date" error={e.target_date} hint="Pace needs a deadline">
        <input id="target_date" name="target_date" type="date" className="field" defaultValue={val.target_date} />
      </Field>
      <Field label="Priority" name="priority" error={e.priority}>
        <select id="priority" name="priority" className="field" defaultValue={val.priority}>
          {[1, 2, 3, 4, 5].map((p) => (
            <option key={p} value={p}>P{p}</option>
          ))}
        </select>
      </Field>
    </div>

    <Field label="What done means" name="success_definition" error={e.success_definition}>
      <input id="success_definition" name="success_definition" className="field" defaultValue={val.success_definition} />
    </Field>
    <Field label="Notes" name="description" error={e.description}>
      <textarea id="description" name="description" className="field" rows={2} defaultValue={val.description} />
    </Field>

    </>
  );
}
