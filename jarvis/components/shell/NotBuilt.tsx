import Link from "next/link";
import { routeInfo } from "@/lib/routes";

/** The page for a route that is planned but not built. Says which milestone owns it. */
export function NotBuilt({ href }: { href: string }) {
  const r = routeInfo(href);
  const when = r.milestone === "Unscheduled" ? "Not scheduled in any milestone yet" : `Milestone ${r.milestone.slice(1)}`;
  return (
    <div className="center-page">
      <div className="panel hud card" data-not-built={r.milestone}>
        <div className="brand-mark" aria-hidden="true" />
        <span className="tag-pill">{r.milestone === "Unscheduled" ? "UNSCHEDULED" : r.milestone}</span>
        <h1>{r.label} is not built yet</h1>
        <p>{r.summary}</p>
        <p className="row-meta">{when}. Nothing on this page reads or writes data.</p>
        <Link className="btn-primary" href="/">
          Back to command center
        </Link>
      </div>
    </div>
  );
}
