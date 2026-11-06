import Link from "next/link";
import { signOut } from "@/app/auth/actions";

const NAV = [
  { href: "/", label: "Command Center" },
  { href: "/goals", label: "Goals" },
  { href: "/tasks", label: "Tasks" },
  { href: "/activity", label: "Activity Ledger" },
] as const;

/** Frame for every page other than the dashboard. Server component. */
export function PageShell({
  title,
  current,
  isDemo,
  actions,
  children,
}: {
  title: string;
  current?: (typeof NAV)[number]["href"];
  isDemo: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="page">
      <header className="page-top">
        <Link href="/" className="page-brand" aria-label="JARVIS command center">
          <span className="brand-mark small" aria-hidden="true" />
          JARVIS
        </Link>
        <nav className="page-nav" aria-label="Primary">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={n.href === current ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="page-top-right">
          {isDemo ? (
            <span className="pill demo">DEMO DATA</span>
          ) : (
            <form action={signOut}>
              <button type="submit" className="link-btn">Sign out</button>
            </form>
          )}
        </div>
      </header>
      <main className="page-main">
        <div className="page-head">
          <h1>{title}</h1>
          {actions}
        </div>
        {isDemo && (
          <p className="demo-note">Demo data. Forms are read only until Supabase is configured in .env.local.</p>
        )}
        {children}
      </main>
    </div>
  );
}
