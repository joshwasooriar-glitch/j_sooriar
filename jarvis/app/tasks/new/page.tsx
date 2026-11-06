import { TaskFormView } from "@/components/forms/TaskFormView";
import { PageShell } from "@/components/shell/PageShell";
import { loadPageData } from "@/lib/supabase/session";
import { createTaskAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ goal?: string; title?: string }> }) {
  const { goal, title } = await searchParams;
  const { session, snap } = await loadPageData(new Date());
  const goals = snap.goals.filter((g) => g.status === "active").map((g) => ({ id: g.id, title: g.title }));
  const prefillGoal = goals.some((g) => g.id === goal) ? goal : undefined;

  return (
    <PageShell title="New task" current="/tasks" isDemo={!session}>
      <TaskFormView
        action={createTaskAction}
        defaults={{ goal_id: prefillGoal ?? null, title: title?.slice(0, 300) }}
        goals={goals}
        milestones={snap.milestones.filter((m) => m.status !== "completed" && m.status !== "skipped")}
        submitLabel="Create task"
        disabled={!session}
      />
    </PageShell>
  );
}
