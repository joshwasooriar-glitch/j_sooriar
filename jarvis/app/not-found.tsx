import Link from "next/link";

export default function NotFound() {
  return (
    <div className="center-page">
      <div className="panel hud card">
        <div className="brand-mark" aria-hidden="true" />
        <h1>Not built yet</h1>
        <p>
          This view is on the Milestone 1 build order but has not been implemented. The command center
          is live.
        </p>
        <Link className="btn-primary" href="/">
          Back to command center
        </Link>
      </div>
    </div>
  );
}
