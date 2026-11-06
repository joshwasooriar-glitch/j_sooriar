import Link from "next/link";
import { notFound } from "next/navigation";
import { TaskFormView } from "@/components/forms/TaskFormView";
import { PageShell } from "@/components/shell/PageShell";
import { TaskStatus } from "@/components/shell/bits";
import { clockTime, shortDate } from "@/lib/dashboard/format";
import { localDateString } from "@/lib/engine/time";
import { loadPageData } from "@/lib/supabase/session";
import { isoToLocalDateTime } from "@/lib/validation/time";
import { cancelTaskAction, completeTaskAction, reopenTaskAction, updateTaskAction } from "../actions";

export const dynamic = "force-dynamic";

const OPEN = new Set(["todo", "in_progress", "blocked"]);

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, snap } = await loadPageData(new Date());
  const task = snap.tasks.find((t) => t.id === id);
  if (!task) notFound();
  const tz = snap.profile.timezone || "America/New_York";
  const goal = task.goal_id ? snap.goals.find((g) => g.id === task.goal_id) : undefined;
  const history = snap.events
    .filter((e) => e.task_id === task.id)
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const isOpen = OPEN.has(task.status);

  return (
    <PageShell
      title={task.title}
      current="/tasks"
      isDemo={!session}
      actions={
        <div className="status-actions">
          <TaskStatus status={task.status} />
          {isOpen && (
            <form action={completeTaskAction}>
              <input type="hidden" name="id" value={task.id} />
              <button className="btn-add" disabled={!session}>Complete</button>
            </form>
          )}
          {task.status === "done" && (
            <form action={reopenTaskAction}>
              <input type="hidden" name="id" value={task.id} />
              <button className="btn-add" disabled={!session} title="Writes a compensating ledger event">Reopen</button>
            </form>
          )}
          {isOpen && (
            <form action={cancelTaskAction}>
              <input type="hidden" name="id" value={task.id} />
              <button className="link-btn" disabled={!session}>Cancel task</button>
            </form>
          )}
        </div>
      }
    >
      {goal && (
        <p className="row-meta">
          Under <Link href={`/goals/${goal.id}`}>{goal.title}</Link>
        </p>
      )}

      {isOpen ? (
        <TaskFormView
          action={updateTaskAction.bind(null, task.id)}
          defaults={{
            title: task.title,
            goal_id: task.goal_id,
            milestone_id: task.milestone_id,
            priority: task.priority,
            due_at: task.due_at ? isoToLocalDateTime(task.due_at, tz) : null,
            estimate_minutes: task.estimate_minutes,
            scale: task.scale,
            status: task.status as "todo" | "in_progress" | "blocked",
          }}
          goals={snap.goals.filter((g) => g.status === "active").map((g) => ({ id: g.id, title: g.title }))}
          milestones={snap.milestones}
          submitLabel="Save changes"
          disabled={!session}
          showStatus
        />
      ) : (
        <p className="empty">This task is {task.status}. Reopen it to edit.</p>
      )}

      <section className="list-section">
        <h2 className="panel-title">Ledger for this task</h2>
        {history.length === 0 ? (
          <p className="empty">No ledger events yet.</p>
        ) : (
          <ul className="rows">
            {history.map((e) => (
              <li key={String(e.id)} className="row">
                <span className="row-title mono">#{String(e.id)} {e.event_type.replace(/_/g, " ")}</span>
                <span className="row-meta mono">
                  {shortDate(localDateString(new Date(e.occurred_at), tz))} {clockTime(new Date(e.occurred_at), tz)} · {e.source} · xp {e.xp}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
