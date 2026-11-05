"use client";

import { Component, type ReactNode } from "react";

/**
 * Contains a failure to one panel. If a panel throws while rendering (a stale
 * build, an unexpected row shape), it shows an empty state in its own grid
 * slot and the rest of the command center keeps working. The error is logged,
 * not swallowed.
 */
export class PanelBoundary extends Component<
  { name: string; span: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`Panel "${this.props.name}" failed to render`, error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className={`panel ${this.props.span} panel-failed`} aria-label={`${this.props.name}, unavailable`}>
        <div className="panel-head">
          <h2 className="panel-title">{this.props.name}</h2>
        </div>
        <p className="empty">
          This panel could not load. The rest of the dashboard is unaffected. Reload the page; if it persists after a
          rebuild, see Troubleshooting in the README.
        </p>
      </section>
    );
  }
}
