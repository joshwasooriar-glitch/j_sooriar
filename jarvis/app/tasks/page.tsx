import Link from "next/link";
import { PageShell } from "@/components/shell/PageShell";
import { TaskStatus } from "@/components/shell/bits";
import { clockTime, shortDate } from "@/lib/dashboard/format";
import { localDateString } from "@/lib/engine/time";
import { loadPageData } from "@/lib/supabase/session";
import { completeTaskAction, reopenTaskAction } from "./actions";

export const dynamic = "force-dynamic";

const VIEWS = { open: "Open", today: "Due today", done: "Done" } as const;
type View = keyof typeof VIEWS;
const OPEN = new Set(["todo", "in_progress", "blocked"]);

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view: raw } = await searchParams;
  const view: View = raw === "today" || raw === "done" ? raw : "open";
  const now = new Date();
  const { session, snap } = await loadPageData(now);
  const tz = snap.profile.timezone || "America/New_York";
  const today = localDateString(now, tz);
  const goalTitle = new Map(snap.goals.map((g) => [g.id, g.title]));

  const tasks = snap.tasks
    .filter((t) =>
      view === "done"
        ? t.status === "done"
        : view === "today"
          ? OPEN.has(t.status) && t.due_at != null && localDateString(new Date(t.due_at), tz) === today
          : OPEN.has(t.status),
    )
    .sort((a, b) => a.priority - b.priority || (a.due_at ?? "9").localeCompare(b.due_at ?? "9"));

  return (
    <PageShell title="Tasks" current="/tasks" isDemo={!session} actions={<Link className="btn-add" href="/tasks/new">+ New task</Link>}>
      <nav className="tabs" aria-label="Task views">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link key={v} href={`/tasks?view=${v}`} aria-current={v === view ? "page" : undefined}>
            {VIEWS[v]}
          </Link>
        ))}
      </nav>
      {tasks.length === 0 ? (
        <p className="empty">Nothing here.</p>
      ) : (
        <ul className="rows">
          {tasks.map((t) => (
            <li key={t.id} className="row">
              <Link href={`/tasks/${t.id}`} className="row-title">{t.title}</Link>
              <span className="row-meta">
                {t.goal_id ? goalTitle.get(t.goal_id) : "No goal"} · P{t.priority}
                {t.due_at ? ` · due ${shortDate(localDateString(new Date(t.due_at), tz))} ${clockTime(new Date(t.due_at), tz)}` : ""}
              </span>
              <TaskStatus status={t.status} />
              {OPEN.has(t.status) ? (
                <form action={completeTaskAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <button className="btn-add" disabled={!session}>Complete</button>
                </form>
              ) : (
                <form action={reopenTaskAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <button className="link-btn" disabled={!session} title="Writes a compensating ledger event">Reopen</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
