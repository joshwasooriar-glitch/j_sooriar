import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icons";
import { milestoneTag, ROUTES } from "@/lib/routes";
import { Ring } from "@/components/ui/Ring";
import { FocusButton } from "./FocusButton";
import { compactNumber } from "@/lib/dashboard/format";
import type { DashboardView } from "@/lib/dashboard/view-model";

const ICONS: Record<string, IconName> = {
  "/": "grid",
  "/goals": "target",
  "/tasks": "check",
  "/timeline": "timeline",
  "/activity": "ledger",
  "/calendar": "calendar",
  "/projects": "folder",
  "/memory": "memory",
  "/jobs": "jobs",
  "/budget": "dollar",
  "/voice": "mic",
};

export function Sidebar({ view }: { view: DashboardView }) {
  // Built pages show live counts. Unbuilt pages show their milestone instead,
  // from the same registry their not-built page reads.
  const counts: Record<string, { text: string; kind?: "hot" | "accent" } | undefined> = {
    "/goals": { text: String(view.nav.goals), kind: "accent" },
    "/tasks": view.nav.tasksDue > 0 ? { text: `${view.nav.tasksDue} due`, kind: "hot" } : undefined,
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true" />
        <div>
          <div className="brand-name">JARVIS</div>
          <div className="brand-sub">COMMAND CENTER</div>
        </div>
      </div>

      <nav className="nav" aria-label="Primary">
        {ROUTES.map((r) => {
          const tag = milestoneTag(r.milestone);
          const count = counts[r.href];
          return (
            <Link
              key={r.href}
              href={r.href}
              aria-current={r.href === "/" ? "page" : undefined}
              className={tag ? "unbuilt" : undefined}
              title={tag ? `Not built yet: ${r.milestone}` : undefined}
            >
              <Icon name={ICONS[r.href] ?? "grid"} />
              <span>{r.label}</span>
              {tag ? (
                <span className="badge tag">{tag}</span>
              ) : (
                count && <span className={`badge ${count.kind ?? ""}`}>{count.text}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <section className="score-card" aria-label="Today's score">
        <h2 className="panel-title">Today&apos;s score</h2>
        <div className="score-row">
          <div style={{ width: 84, flex: "none" }}>
            <Ring
              value={view.score.today == null ? null : view.score.today / 100}
              label={view.score.today == null ? "Score unavailable" : `Score ${view.score.today} of 100`}
              size={84}
              stroke={8}
            />
          </div>
          <div>
            {view.score.today == null ? (
              <div className="score-na">Score unavailable</div>
            ) : (
              <div className="score-big num">{view.score.today}</div>
            )}
            <div className="score-sub">
              Level {view.score.level} · {compactNumber(view.score.totalXp)} XP
            </div>
          </div>
        </div>
        <div
          className="coverage"
          title={
            view.score.coverage.components.length
              ? `Measured: ${view.score.coverage.components.join(", ").replace(/_/g, " ")}`
              : "Nothing measurable yet today"
          }
        >
          <span>Coverage</span>
          <span className="mono">
            {view.score.coverage.measured} of {view.score.coverage.of} components
          </span>
        </div>
        <div className="coverage">
          <span>Evening review</span>
          <span className={view.score.reviewDone ? "tone-good" : "mono"}>
            {view.score.reviewDone ? "● done" : "not logged"}
          </span>
        </div>
        <div className="streak">
          <Icon name="flame" size={16} style={{ color: "var(--warn)" }} />
          {view.score.streak} day streak
        </div>
      </section>

      <FocusButton variant="primary" />
    </aside>
  );
}
