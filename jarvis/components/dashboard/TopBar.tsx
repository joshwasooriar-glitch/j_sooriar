import { Icon } from "@/components/ui/icons";
import { fmt } from "@/lib/ai/cost";
import type { DashboardView } from "@/lib/dashboard/view-model";
import { signOut } from "@/app/auth/actions";
import { Clock } from "./Clock";

const BUDGET_COLOR: Record<DashboardView["budget"]["state"], string> = {
  ok: "var(--good)",
  warn: "var(--warn)",
  restrict: "var(--orange)",
  luna_only: "var(--bad)",
  hard_stop: "var(--bad)",
};

export function TopBar({ view }: { view: DashboardView }) {
  const color = BUDGET_COLOR[view.budget.state];

  return (
    <header className="topbar">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {view.aiEnabled ? (
          <span className="pill" title={`Budget state: ${view.budget.state}`}>
            <span className="dot" style={{ background: color, color }} />
            AI BUDGET <b className="num" style={{ color }}>{fmt(view.budget.spentCents)}</b> / {fmt(view.budget.limitCents)}
          </span>
        ) : (
          <span className="pill ai-off" title="JARVIS_AI_ENABLED is off. No model requests are made. The engine still answers.">
            <span className="dot" aria-hidden="true" />
            AI OFF
          </span>
        )}
        {view.isDemo && (
          <span className="pill demo" title="Supabase is not configured. Numbers are derived from a built-in fixture.">
            DEMO DATA
          </span>
        )}
      </div>

      <Clock initialIso={view.nowIso} timeZone={view.timeZone} />

      <div className="topbar-right">
        <div className="search" role="search" aria-label="Search, coming with the command palette">
          <Icon name="search" size={16} />
          <span>Search goals, tasks, memory</span>
          <kbd>⌘K</kbd>
        </div>
        <span className="icon-btn" aria-label="Notifications">
          <Icon name="bell" size={16} />
        </span>
        <div className="user">
          <div>
            <div className="user-name">{view.profile.name}</div>
            {view.profile.school && <div className="user-sub">{view.profile.school}</div>}
          </div>
          <div className="avatar" aria-hidden="true">{view.profile.initial}</div>
        </div>
        {!view.isDemo && (
          <form action={signOut}>
            <button type="submit" className="link-btn">Sign out</button>
          </form>
        )}
      </div>
    </header>
  );
}
