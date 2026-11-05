import { Icon } from "@/components/ui/icons";
import { AskBar } from "./AskBar";
import type { DashboardView } from "@/lib/dashboard/view-model";

export function Footer({ view }: { view: DashboardView }) {
  const p = view.profile;
  return (
    <footer className="footer">
      <div className="facts">
        {p.location && (
          <div className="fact">
            <Icon name="pin" size={16} />
            <div>
              <div className="fact-l">Location</div>
              <div className="fact-v">{p.location}</div>
            </div>
          </div>
        )}
        {p.daysToGraduation != null && (
          <div className="fact">
            <Icon name="cap" size={16} />
            <div>
              <div className="fact-l">Graduation</div>
              <div className="fact-v num">{p.daysToGraduation} days</div>
            </div>
          </div>
        )}
        {view.milestone && (
          <div className="fact">
            <Icon name="trend" size={16} />
            <div>
              <div className="fact-l">{view.milestone.label}</div>
              <div className="fact-v accent">{view.milestone.dueLabel ?? "No due date"}</div>
            </div>
          </div>
        )}
      </div>

      <AskBar />

      <button type="button" className="btn-ghost" aria-disabled="true" title="Morning brief is Milestone 2">
        <Icon name="doc" size={16} />
        Morning brief
      </button>
    </footer>
  );
}
