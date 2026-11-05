import { z } from "zod";
import { localDateTimeToIso } from "./time";

/**
 * Form schemas for goals, milestones and tasks.
 *
 * Every schema is .strict(): a payload carrying current_value, pace_status,
 * progress_percentage or any other field is rejected rather than ignored.
 * Derived values are never written from a form (CLAUDE.md invariant 1), and
 * completion is never a form field: it goes through complete_task.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optText = (max: number) => z.preprocess(blankToNull, z.string().trim().max(max).nullable().default(null));
const optUuid = z.preprocess(blankToNull, z.string().uuid().nullable().default(null));
const optDate = z.preprocess(blankToNull, z.string().regex(DATE, "Use YYYY-MM-DD").nullable().default(null));
const priority = z.coerce.number().int().min(1).max(5);

/** Pick only the named fields from FormData, so Next's own hidden fields never reach a schema. */
export function formFields(fd: FormData, names: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of names) {
    const v = fd.get(n);
    if (typeof v === "string") out[n] = v;
  }
  return out;
}

// ------------------------------------------------------------------ goals

export const GOAL_FIELDS = [
  "title", "description", "success_definition", "domain_id", "new_domain",
  "metric_type", "target_value", "unit", "start_date", "target_date", "priority",
] as const;

export const GoalForm = z
  .object({
    title: z.string().trim().min(1, "A title is required").max(200),
    description: optText(2000),
    success_definition: optText(1000),
    domain_id: optUuid,
    new_domain: optText(60),
    metric_type: z.enum(["percent", "count", "binary", "value"]),
    target_value: z.preprocess(blankToNull, z.coerce.number().positive("Target must be above zero").max(1_000_000).nullable().default(null)),
    unit: optText(40),
    start_date: z.string().regex(DATE, "Use YYYY-MM-DD"),
    target_date: optDate,
    priority,
  })
  .strict()
  .superRefine((g, ctx) => {
    if (g.target_date && g.target_date < g.start_date) {
      ctx.addIssue({ code: "custom", path: ["target_date"], message: "The deadline is before the start date" });
    }
    if ((g.metric_type === "count" || g.metric_type === "value") && g.target_value == null) {
      ctx.addIssue({ code: "custom", path: ["target_value"], message: "Count and value goals need a target" });
    }
    if (g.metric_type === "count" && !g.unit) {
      // Capture matches count goals on their unit noun ("3 applications").
      ctx.addIssue({ code: "custom", path: ["unit"], message: "Count goals need a unit, like applications or sessions" });
    }
  })
  .transform((g) => ({
    ...g,
    target_value: g.metric_type === "percent" ? (g.target_value ?? 100) : g.metric_type === "binary" ? 1 : g.target_value,
    unit: g.metric_type === "percent" ? "%" : g.unit,
  }));
export type GoalForm = z.infer<typeof GoalForm>;

/** The goals row a form may write. Note what is absent: current_value and anything derived. */
export function goalRow(g: GoalForm, domainId: string | null) {
  return {
    title: g.title,
    description: g.description,
    success_definition: g.success_definition,
    domain_id: domainId,
    metric_type: g.metric_type,
    target_value: g.target_value,
    unit: g.unit,
    start_date: g.start_date,
    target_date: g.target_date,
    priority: g.priority,
  };
}

export const GoalStatus = z.enum(["active", "paused", "completed", "abandoned"]);

// ------------------------------------------------------------------ milestones

export const MILESTONE_FIELDS = ["goal_id", "title", "due_date", "target_value"] as const;

export const MilestoneForm = z
  .object({
    goal_id: z.string().uuid(),
    title: z.string().trim().min(1, "A title is required").max(200),
    due_date: optDate,
    target_value: z.preprocess(blankToNull, z.coerce.number().nonnegative().nullable().default(null)),
  })
  .strict();

export const MilestoneStatus = z.enum(["pending", "active", "completed", "skipped"]);

// ------------------------------------------------------------------ tasks

export const TASK_FIELDS = [
  "title", "notes", "goal_id", "milestone_id", "priority", "due_at", "estimate_minutes", "scale", "status",
] as const;

/** status here is only ever an open state. done goes through complete_task; cancelled through cancelTask. */
export const TaskForm = z
  .object({
    title: z.string().trim().min(1, "A title is required").max(300),
    notes: optText(4000),
    goal_id: optUuid,
    milestone_id: optUuid,
    priority,
    /** datetime-local in the user's timezone. */
    due_at: z.preprocess(blankToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use the date picker").nullable().default(null)),
    estimate_minutes: z.preprocess(blankToNull, z.coerce.number().int().min(1).max(1440).nullable().default(null)),
    scale: z.enum(["micro", "macro"]).default("micro"),
    status: z.enum(["todo", "in_progress", "blocked"]).default("todo"),
  })
  .strict();
export type TaskForm = z.infer<typeof TaskForm>;

export function taskRow(t: TaskForm, timeZone: string) {
  return {
    title: t.title,
    notes: t.notes,
    goal_id: t.goal_id,
    milestone_id: t.milestone_id,
    priority: t.priority,
    due_at: t.due_at ? localDateTimeToIso(t.due_at, timeZone) : null,
    estimate_minutes: t.estimate_minutes,
    scale: t.scale,
    status: t.status,
  };
}

/** Field errors keyed by field name, for redisplaying a form. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = String(i.path[0] ?? "form");
    out[k] ??= i.message;
  }
  return out;
}
