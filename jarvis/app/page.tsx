import { redirect } from "next/navigation";
import { FocusButton } from "@/components/dashboard/FocusButton";
import { Footer } from "@/components/dashboard/Footer";
import { PanelBoundary } from "@/components/dashboard/PanelBoundary";
import {
  ActiveGoals,
  GoalOrbit,
  LedgerPanel,
  ModelRouting,
  QuickCommands,
  Priority,
  Signals,
  SystemOverview,
} from "@/components/dashboard/panels";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { aiEnabled } from "@/lib/ai/flags";
import { buildDashboard } from "@/lib/dashboard/view-model";
import type { DashboardSnapshot } from "@/lib/dashboard/snapshot";
import { loadDashboardSnapshot } from "@/lib/db/dashboard";
import { demoSnapshot } from "@/lib/db/demo";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Every value is read fresh. Nothing on this page may be cached or live in React state alone.
export const dynamic = "force-dynamic";

export default async function CommandCenter() {
  const now = new Date();
  let snapshot: DashboardSnapshot;

  if (isSupabaseConfigured()) {
    const db = await createSupabaseServerClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) redirect("/login");
    snapshot = await loadDashboardSnapshot(db, user.id, now);
  } else {
    // Fresh clone with no .env.local: render the fixture, flagged DEMO DATA in the top bar.
    snapshot = demoSnapshot(now);
  }

  const view = buildDashboard(snapshot, now, { aiEnabled: aiEnabled() });

  return (
    <div className="shell">
      <Sidebar view={view} />
      <div className="main">
        <TopBar view={view} />
        <main className="grid">
          <PanelBoundary name="System overview" span="span-3">
            <SystemOverview view={view} />
          </PanelBoundary>
          <PanelBoundary name="Goal orbit" span="span-6 orbit-panel">
            <GoalOrbit view={view} />
          </PanelBoundary>
          <PanelBoundary name="Quick commands" span="span-3">
            <QuickCommands focusSlot={<FocusButton variant="cmd" />} />
          </PanelBoundary>
          <PanelBoundary name="Active goals" span="span-5">
            <ActiveGoals view={view} />
          </PanelBoundary>
          <PanelBoundary name="Priority" span="span-7">
            <Priority view={view} />
          </PanelBoundary>
          <PanelBoundary name="Signals" span="span-4">
            <Signals view={view} />
          </PanelBoundary>
          <PanelBoundary name="Ledger" span="span-4">
            <LedgerPanel view={view} />
          </PanelBoundary>
          <PanelBoundary name="Model routing" span="span-4">
            <ModelRouting view={view} />
          </PanelBoundary>
        </main>
        <Footer view={view} />
      </div>
    </div>
  );
}
