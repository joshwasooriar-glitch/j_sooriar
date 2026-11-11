import Link from "next/link";
import { notFound } from "next/navigation";
import { GoalFormView } from "@/components/forms/GoalFormView";
import { GoalStatusForms } from "@/components/goals/GoalStatusForms";
import { MilestoneFormView } from "@/components/forms/MilestoneFormView";
import { PageShell } from "@/components/shell/PageShell";
import { PaceChip, ProgressBar, TaskStatus } from "@/components/shell/bits";
import { goalProgressMap } from "@/lib/dashboard/goals";
import { friendlyDate, pct, trimNumber } from "@/lib/dashboard/format";
import { listDomains } from "@/lib/db/entities";
import { loadPageData } from "@/lib/supabase/session";
import { completeTaskAction } from "@/app/tasks/actions";
import { addMilestoneAction, setGoalStatusAction, setMilestoneStatusAction, updateGoalAction } from "../actions";

export const dynamic = "force-dynamic";

const OPEN = new Set(["todo", "in_progress", "blocked"]);

export default async function GoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const now = new Date();
  const { session, snap } = await loadPageData(now);
  const goal = snap.goals.find((g) => g.id === id);
  if (!goal) notFound();

  const { progress: p, current } = goalProgressMap(snap, now).get(goal.id)!;
  const milestones = snap.milestones.filter((m) => m.goal_id === goal.id).sort((a, b) => a.sort_order - b.sort_order);
  const tasks = snap.tasks
    .filter((t) => t.goal_id === goal.id)
    .sort((a, b) => Number(!OPEN.has(a.status)) - Number(!OPEN.has(b.status)) || a.priority - b.priority);
  const domains = session ? await listDomains(session.db) : [];
  const update = updateGoalAction.bind(null, goal.id);

  const value =
    goal.metric_type === "count" && goal.target_value
      ? `${trimNumber(current)} of ${trimNumber(Number(goal.target_value))} ${goal.unit ?? ""}`
      : `${pct(p.percentComplete)} done`;

  return (
    <PageShell
      title={goal.title}
      current="/goals"
      isDemo={!session}
      actions={
        <GoalStatusForms goalId={goal.id} status={goal.status} action={setGoalStatusAction} disabled={!session} />
      }
    >
      <section className="panel detail-hero">
        <div className="hero-numbers">
          <div>
            <div className="stat-v">{value}</div>
            <div className="stat-l">from the ledger · expected {pct(p.expectedProgress)} by today</div>
          </div>
          <PaceChip progress={p} />
        </div>
        <ProgressBar progress={p} />
        <div className="row-meta mono">
          P{goal.priority}
          {p.daysRemaining != null ? ` · ${p.daysRemaining} days left` : " · no deadline"}
          {goal.metric_type === "count" ? ` · log with "3 ${goal.unit ?? "units"}" in the Ask bar` : ""}
        </div>
      </section>

      <section className="list-section">
        <div className="section-head">
          <h2 className="panel-title">Tasks</h2>
          <Link className="btn-add" href={`/tasks/new?goal=${goal.id}`}>+ Add task</Link>
        </div>
        {tasks.length === 0 ? (
          <p className="empty">No tasks under this goal yet.</p>
        ) : (
          <ul className="rows">
            {tasks.map((t) => (
              <li key={t.id} className="row">
                <Link href={`/tasks/${t.id}`} className="row-title">{t.title}</Link>
                <span className="row-meta mono">P{t.priority}</span>
                <TaskStatus status={t.status} />
                {OPEN.has(t.status) && (
                  <form action={completeTaskAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="btn-add" disabled={!session}>Complete</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="list-section">
        <h2 className="panel-title">Milestones</h2>
        <ul className="rows">
          {milestones.map((m) => (
            <li key={m.id} className="row">
              <span className="row-title">{m.title}</span>
              <span className="row-meta mono">{m.due_date ? friendlyDate(m.due_date) : "no date"}</span>
              <form action={setMilestoneStatusAction} className="status-actions">
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="goal_id" value={goal.id} />
                <select name="status" defaultValue={m.status} className="field small" aria-label={`Status of ${m.title}`} disabled={!session}>
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="skipped">Skipped</option>
                </select>
                <button className="link-btn" disabled={!session}>Set</button>
              </form>
            </li>
          ))}
        </ul>
        <MilestoneFormView action={addMilestoneAction} goalId={goal.id} disabled={!session} />
      </section>

      <details className="list-section">
        <summary className="panel-title">Edit goal</summary>
        <GoalFormView
          action={update}
          defaults={{
            title: goal.title,
            domain_id: goal.domain_id,
            metric_type: goal.metric_type,
            target_value: goal.target_value,
            unit: goal.unit,
            start_date: goal.start_date,
            target_date: goal.target_date,
            priority: goal.priority,
          }}
          domains={domains}
          submitLabel="Save changes"
          disabled={!session}
        />
      </details>
    </PageShell>
  );
}
