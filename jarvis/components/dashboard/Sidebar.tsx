import { Icon, type IconName } from "@/components/ui/icons";
import { Ring } from "@/components/ui/Ring";
import { compactNumber } from "@/lib/dashboard/format";
import type { DashboardView } from "@/lib/dashboard/view-model";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  badge?: { text: string; kind?: "hot" | "accent" | "tag" };
  disabled?: boolean;
}

export function Sidebar({ view }: { view: DashboardView }) {
  const items: NavItem[] = [
    { href: "/", label: "Command Center", icon: "grid" },
    { href: "/goals", label: "Goals", icon: "target", badge: { text: String(view.nav.goals), kind: "accent" } },
    {
      href: "/tasks",
      label: "Tasks",
      icon: "check",
      badge: view.nav.tasksDue > 0 ? { text: `${view.nav.tasksDue} due`, kind: "hot" } : undefined,
    },
    { href: "/timeline", label: "Timeline", icon: "timeline" },
    { href: "/activity", label: "Activity Ledger", icon: "ledger" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/projects", label: "Projects", icon: "folder", badge: { text: String(view.nav.projects) } },
    { href: "/memory", label: "Memory", icon: "memory", badge: { text: String(view.nav.memory) } },
    { href: "/jobs", label: "Jobs", icon: "jobs", badge: { text: String(view.nav.jobs) } },
    { href: "/budget", label: "Budget", icon: "dollar" },
    // Voice is Milestone 5. Shown, but honest about it.
    { href: "/voice", label: "Voice", icon: "mic", badge: { text: "DEC 7", kind: "tag" }, disabled: true },
  ];

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
        {items.map((it) => (
          <a
            key={it.href}
            href={it.disabled ? undefined : it.href}
            aria-current={it.href === "/" ? "page" : undefined}
            aria-disabled={it.disabled || undefined}
          >
            <Icon name={it.icon} />
            <span>{it.label}</span>
            {it.badge && <span className={`badge ${it.badge.kind ?? ""}`}>{it.badge.text}</span>}
          </a>
        ))}
      </nav>

      <section className="score-card" aria-label="Today's score">
        <h2 className="panel-title">Today&apos;s score</h2>
        <div className="score-row">
          <div style={{ width: 84, flex: "none" }}>
            <Ring value={view.score.today / 100} label={`Score ${view.score.today} of 100`} size={84} stroke={8} />
          </div>
          <div>
            <div className="score-big num">{view.score.today}</div>
            <div className="score-sub">
              Level {view.score.level} · {compactNumber(view.score.totalXp)} XP
            </div>
          </div>
        </div>
        <div className="streak">
          <Icon name="flame" size={16} style={{ color: "var(--warn)" }} />
          {view.score.streak} day streak
        </div>
      </section>

      <button type="button" className="btn-primary" disabled title="Focus blocks are wired with /api/capture">
        Start focus block
      </button>
    </aside>
  );
}
