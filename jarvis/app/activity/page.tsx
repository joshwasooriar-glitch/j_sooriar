import Link from "next/link";
import { ConfirmButton } from "@/components/forms/ConfirmButton";
import { PageShell } from "@/components/shell/PageShell";
import { clockTime, shortDate } from "@/lib/dashboard/format";
import { REVERSAL_EVENT_TYPE } from "@/lib/engine/ledger";
import { localDateString } from "@/lib/engine/time";
import { loadPageData } from "@/lib/supabase/session";
import { reverseEventAction } from "./actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 200;

const ERRORS: Record<string, string> = {
  JV409: "That event was already reversed.",
  JV404: "That event was not found.",
  JV422: "A reversal cannot itself be reversed.",
};

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ reversed?: string; error?: string; id?: string; msg?: string }>;
}) {
  const q = await searchParams;
  const { session, snap } = await loadPageData(new Date());
  const tz = snap.profile.timezone || "America/New_York";
  const goalTitle = new Map(snap.goals.map((g) => [g.id, g.title]));
  const taskTitle = new Map(snap.tasks.map((t) => [t.id, t.title]));

  // Which events are reversed, and by which row.
  const reversedBy = new Map<string, string>();
  for (const e of snap.events) {
    if (e.event_type === REVERSAL_EVENT_TYPE && e.meta?.reverses_event_id != null) {
      reversedBy.set(String(e.meta.reverses_event_id), String(e.id));
    }
  }

  const rows = [...snap.events]
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, PAGE_SIZE);

  return (
    <PageShell title="Activity Ledger" current="/activity" isDemo={!session}>
      <p className="row-meta">
        Append only. Every number on the dashboard is computed from these rows. Reversing an event adds a compensating
        row and never deletes the original; a completed task goes back to its prior status. Showing the latest{" "}
        {Math.min(PAGE_SIZE, snap.events.length)} of {snap.events.length}.
      </p>
      {q.reversed && <p className="notice good" role="status">Reversed event #{q.reversed}.</p>}
      {q.error && <p className="notice bad" role="alert">{ERRORS[q.error] ?? "That could not be reversed."} (#{q.id})</p>}
      {q.msg === "demo" && <p className="notice bad" role="alert">Demo data: nothing was written.</p>}

      {rows.length === 0 ? (
        <p className="empty">The ledger is empty.</p>
      ) : (
        <ul className="rows ledger">
          {rows.map((e) => {
            const id = String(e.id);
            const isReversal = e.event_type === REVERSAL_EVENT_TYPE;
            const reversal = reversedBy.get(id);
            const subject = e.task_id ? taskTitle.get(e.task_id) : e.goal_id ? goalTitle.get(e.goal_id) : null;
            const at = new Date(e.occurred_at);
            return (
              <li key={id} className={`row ${reversal ? "is-reversed" : ""} ${isReversal ? "is-reversal" : ""}`}>
                <span className="mono row-id">#{id}</span>
                <div className="row-main">
                  <span className="row-title">
                    {e.event_type.replace(/_/g, " ")}
                    {isReversal && ` of #${String(e.meta?.reverses_event_id)}`}
                    {subject && <span className="row-meta"> · {subject}</span>}
                  </span>
                  <span className="row-meta mono">
                    {shortDate(localDateString(at, tz))} {clockTime(at, tz)} · {e.source} · qty {Number(e.quantity)} · xp {e.xp}
                    {typeof e.meta?.minutes === "number" ? ` · ${e.meta.minutes} min` : ""}
                    {e.task_id && (
                      <>
                        {" · "}
                        <Link href={`/tasks/${e.task_id}`}>task</Link>
                      </>
                    )}
                  </span>
                </div>
                {reversal ? (
                  <span className="row-meta">reversed by #{reversal}</span>
                ) : isReversal ? (
                  <span className="row-meta">compensating row</span>
                ) : (
                  <form action={reverseEventAction}>
                    <input type="hidden" name="id" value={id} />
                    <ConfirmButton label="Reverse" confirmLabel={`Reverse #${id}`} disabled={!session} />
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
