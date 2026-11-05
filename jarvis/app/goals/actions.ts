"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createGoal, createMilestone, ensureDomain, setGoalStatus, setMilestoneStatus, updateGoal } from "@/lib/db/entities";
import { requireSession } from "@/lib/supabase/session";
import { DEMO_STATE, type FormState } from "@/lib/validation/form-state";
import {
  fieldErrors,
  formFields,
  GOAL_FIELDS,
  GoalForm,
  goalRow,
  GoalStatus,
  MILESTONE_FIELDS,
  MilestoneForm,
  MilestoneStatus,
} from "@/lib/validation/forms";

const Id = z.string().uuid();

async function parseGoal(fd: FormData) {
  return GoalForm.safeParse(formFields(fd, GOAL_FIELDS));
}

export async function createGoalAction(_: FormState, fd: FormData): Promise<FormState> {
  const session = await requireSession();
  if (!session) return DEMO_STATE;
  const parsed = await parseGoal(fd);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const g = parsed.data;
  const domainId = g.new_domain ? await ensureDomain(session.db, session.userId, g.new_domain) : g.domain_id;
  const id = await createGoal(session.db, session.userId, goalRow(g, domainId));
  revalidatePath("/");
  redirect(`/goals/${id}`);
}

export async function updateGoalAction(goalId: string, _: FormState, fd: FormData): Promise<FormState> {
  const session = await requireSession();
  if (!session) return DEMO_STATE;
  if (!Id.safeParse(goalId).success) return { message: "Unknown goal." };
  const parsed = await parseGoal(fd);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const g = parsed.data;
  const domainId = g.new_domain ? await ensureDomain(session.db, session.userId, g.new_domain) : g.domain_id;
  await updateGoal(session.db, goalId, goalRow(g, domainId));
  revalidatePath("/");
  revalidatePath(`/goals/${goalId}`);
  return { message: "Saved. Pace is recomputed from the new values on this read." };
}

export async function setGoalStatusAction(fd: FormData): Promise<void> {
  const session = await requireSession();
  const id = Id.parse(fd.get("id"));
  const status = GoalStatus.parse(fd.get("status"));
  if (session) await setGoalStatus(session.db, id, status);
  revalidatePath("/");
  revalidatePath(`/goals/${id}`);
}

export async function addMilestoneAction(_: FormState, fd: FormData): Promise<FormState> {
  const session = await requireSession();
  if (!session) return DEMO_STATE;
  const parsed = MilestoneForm.safeParse(formFields(fd, MILESTONE_FIELDS));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  await createMilestone(session.db, parsed.data);
  revalidatePath(`/goals/${parsed.data.goal_id}`);
  return { message: "Milestone added." };
}

export async function setMilestoneStatusAction(fd: FormData): Promise<void> {
  const session = await requireSession();
  const id = Id.parse(fd.get("id"));
  const goalId = Id.parse(fd.get("goal_id"));
  const status = MilestoneStatus.parse(fd.get("status"));
  if (session) await setMilestoneStatus(session.db, id, status);
  revalidatePath(`/goals/${goalId}`);
}
