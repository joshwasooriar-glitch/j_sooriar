import Link from "next/link";
import { PageShell } from "@/components/shell/PageShell";
import { PaceChip, ProgressBar } from "@/components/shell/bits";
import { goalProgressMap } from "@/lib/dashboard/goals";
import { pct, shortDate, trimNumber } from "@/lib/dashboard/format";
import { loadPageData } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

const GROUPS = [
  { label: "Active", statuses: ["active"] },
  { label: "Paused", statuses: ["paused"] },
  { label: "Finished", statuses: ["completed", "abandoned"] },
] as const;

export default async function GoalsPage() {
  const now = new Date();
  const { session, snap } = await loadPageData(now);
  const progress = goalProgressMap(snap, now);
  const goals = [...snap.goals].sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));

  return (
    <PageShell
      title="Goals"
      current="/goals"
      isDemo={!session}
      actions={<Link className="btn-add" href="/goals/new">+ New goal</Link>}
    >
      {goals.length === 0 && <p className="empty">No goals yet. Create one to start tracking pace.</p>}
      {GROUPS.map((group) => {
        const rows = goals.filter((g) => (group.statuses as readonly string[]).includes(g.status));
        if (rows.length === 0) return null;
        return (
          <section key={group.label} className="list-section">
            <h2 className="panel-title">{group.label}</h2>
            <ul className="rows">
              {rows.map((g) => {
                const p = progress.get(g.id)!;
                const value =
                  g.metric_type === "count" && g.target_value
                    ? `${trimNumber(p.current)} / ${trimNumber(Number(g.target_value))} ${g.unit ?? ""}`
                    : pct(p.progress.percentComplete);
                return (
                  <li key={g.id}>
                    <Link href={`/goals/${g.id}`} className="row-link">
                      <div className="row-main">
                        <span className="row-title">{g.title}</span>
                        <span className="row-meta mono">
                          P{g.priority} · {value}
                          {g.target_date ? ` · due ${shortDate(g.target_date)}` : " · no deadline"}
                        </span>
                      </div>
                      <div className="row-side">
                        <ProgressBar progress={p.progress} />
                        <PaceChip progress={p.progress} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </PageShell>
  );
}
