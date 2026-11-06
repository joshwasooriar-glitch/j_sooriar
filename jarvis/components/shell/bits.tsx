import { PACE_DISPLAY, pct } from "@/lib/dashboard/format";
import type { GoalProgress } from "@/lib/engine/types";

export function PaceChip({ progress }: { progress: GoalProgress }) {
  const d = PACE_DISPLAY[progress.paceStatus];
  return (
    <span className={`chip tone-${d.tone}`}>
      <span aria-hidden="true">{d.glyph}</span>
      {d.label}
    </span>
  );
}

export function ProgressBar({ progress }: { progress: GoalProgress }) {
  return (
    <div
      className="bar"
      role="img"
      aria-label={`${pct(progress.percentComplete)} complete, ${pct(progress.expectedProgress)} expected`}
    >
      <div className="bar-fill" style={{ width: pct(progress.percentComplete ?? 0), background: "var(--accent)" }} />
      {progress.expectedProgress != null && <div className="bar-tick" style={{ left: pct(progress.expectedProgress) }} />}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

export function TaskStatus({ status }: { status: string }) {
  return <span className={`status s-${status}`}>{STATUS_LABEL[status] ?? status}</span>;
}
