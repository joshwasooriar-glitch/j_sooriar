import { redirect } from "next/navigation";
import { Footer } from "@/components/dashboard/Footer";
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

  const view = buildDashboard(snapshot, now);

  return (
    <div className="shell">
      <Sidebar view={view} />
      <div className="main">
        <TopBar view={view} />
        <main className="grid">
          <SystemOverview view={view} />
          <GoalOrbit view={view} />
          <QuickCommands />
          <ActiveGoals view={view} />
          <Priority view={view} />
          <Signals view={view} />
          <LedgerPanel view={view} />
          <ModelRouting view={view} />
        </main>
        <Footer view={view} />
      </div>
    </div>
  );
}
