"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cancelTask, createTask, latestCompletion, updateOpenTask } from "@/lib/db/entities";
import { completeTask, LedgerError, reverseEvent } from "@/lib/db/ledger";
import { loadPageData, requireSession } from "@/lib/supabase/session";
import { DEMO_STATE, type FormState } from "@/lib/validation/form-state";
import { fieldErrors, formFields, TASK_FIELDS, TaskForm, taskRow } from "@/lib/validation/forms";

const Id = z.string().uuid();

function refresh(taskId?: string, goalId?: string | null) {
  revalidatePath("/");
  revalidatePath("/tasks");
  if (taskId) revalidatePath(`/tasks/${taskId}`);
  if (goalId) revalidatePath(`/goals/${goalId}`);
}

export async function createTaskAction(_: FormState, fd: FormData): Promise<FormState> {
  const { session, snap } = await loadPageData(new Date());
  if (!session) return DEMO_STATE;
  const parsed = TaskForm.safeParse(formFields(fd, TASK_FIELDS));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const id = await createTask(session.db, session.userId, taskRow(parsed.data, snap.profile.timezone));
  refresh(id, parsed.data.goal_id);
  redirect(`/tasks/${id}`);
}

export async function updateTaskAction(taskId: string, _: FormState, fd: FormData): Promise<FormState> {
  const { session, snap } = await loadPageData(new Date());
  if (!session) return DEMO_STATE;
  if (!Id.safeParse(taskId).success) return { message: "Unknown task." };
  const parsed = TaskForm.safeParse(formFields(fd, TASK_FIELDS));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const ok = await updateOpenTask(session.db, taskId, taskRow(parsed.data, snap.profile.timezone));
  refresh(taskId, parsed.data.goal_id);
  return ok ? { message: "Saved." } : { message: "Only open tasks can be edited. Reopen it first." };
}

/** Completion is a ledger write: complete_task closes the task and appends task_completed atomically. */
export async function completeTaskAction(fd: FormData): Promise<void> {
  const session = await requireSession();
  const id = Id.parse(fd.get("id"));
  if (session) {
    try {
      await completeTask(session.db, id, "task_page", null);
    } catch (err) {
      if (!(err instanceof LedgerError && err.code === "JV409")) throw err; // already done is fine
    }
  }
  refresh(id);
}

/**
 * Reopen writes a compensating event through reverse_activity_event with no
 * time limit, the same path as the Activity Ledger's reverse. The task's prior
 * status comes back from the audit row complete_task wrote.
 */
export async function reopenTaskAction(fd: FormData): Promise<void> {
  const session = await requireSession();
  const id = Id.parse(fd.get("id"));
  if (session) {
    const eventId = await latestCompletion(session.db, id);
    if (eventId != null) await reverseEvent(session.db, eventId, null, "ledger");
  }
  refresh(id);
}

export async function cancelTaskAction(fd: FormData): Promise<void> {
  const session = await requireSession();
  const id = Id.parse(fd.get("id"));
  if (session) await cancelTask(session.db, id);
  refresh(id);
}
