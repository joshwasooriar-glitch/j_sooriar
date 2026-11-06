import { GoalFormView } from "@/components/forms/GoalFormView";
import { PageShell } from "@/components/shell/PageShell";
import { listDomains } from "@/lib/db/entities";
import { localDateString } from "@/lib/engine/time";
import { requireSession } from "@/lib/supabase/session";
import { createGoalAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewGoalPage() {
  const session = await requireSession();
  const domains = session ? await listDomains(session.db) : [];
  const today = localDateString(new Date(), process.env.JARVIS_TIMEZONE ?? "America/New_York");

  return (
    <PageShell title="New goal" current="/goals" isDemo={!session}>
      <GoalFormView action={createGoalAction} defaults={{ start_date: today }} domains={domains} submitLabel="Create goal" disabled={!session} />
    </PageShell>
  );
}
