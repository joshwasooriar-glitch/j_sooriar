import Link from "next/link";

/** A path that is not a page and not planned. Planned pages have their own NotBuilt page. */
export default function NotFound() {
  return (
    <div className="center-page">
      <div className="panel hud card">
        <div className="brand-mark" aria-hidden="true" />
        <h1>Page not found</h1>
        <p>There is no page at this address.</p>
        <Link className="btn-primary" href="/">
          Back to command center
        </Link>
      </div>
    </div>
  );
}
