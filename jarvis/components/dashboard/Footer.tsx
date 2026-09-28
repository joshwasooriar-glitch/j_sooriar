import { Icon } from "@/components/ui/icons";
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

      {/* Chat lands at build step 5. The form already points at the right place. */}
      <form className="ask" action="/chat" method="get" role="search">
        <Icon name="chat" />
        <input
          name="q"
          aria-label="Ask JARVIS"
          placeholder="How are we doing in terms of progress towards the goals?"
          autoComplete="off"
        />
        <span className="mic" title="Voice is Milestone 5, Dec 7" aria-label="Voice input, not available until Milestone 5">
          <Icon name="mic" size={16} />
        </span>
      </form>

      <button type="button" className="btn-ghost" aria-disabled="true" title="Morning brief is Milestone 2">
        <Icon name="doc" size={16} />
        Morning brief
      </button>
    </footer>
  );
}
