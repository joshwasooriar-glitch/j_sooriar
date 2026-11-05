/**
 * Command center panels. Server components: they render a DashboardView and
 * never compute anything the view model did not already compute.
 */

import { Icon, type IconName } from "@/components/ui/icons";
import { Ring } from "@/components/ui/Ring";
import { fmt } from "@/lib/ai/cost";
import { PACE_DISPLAY, compactNumber, pct, shortDate } from "@/lib/dashboard/format";
import type { DashboardView, GoalCard } from "@/lib/dashboard/view-model";

const goalColor = (c: GoalCard) => `var(--goal-${c.colorIndex % 5})`;

function PaceChip({ card }: { card: GoalCard }) {
  const d = PACE_DISPLAY[card.paceStatus];
  return (
    <span className={`chip tone-${d.tone}`}>
      <span aria-hidden="true">{d.glyph}</span>
      {d.label}
    </span>
  );
}

// ============================================================ system overview

export function SystemOverview({ view }: { view: DashboardView }) {
  const s = view.system;
  const rows: { icon: IconName; name: string; sub: string; live: boolean }[] = [
    { icon: "trend", name: "Progress Engine", sub: "Deterministic · $0", live: true },
    { icon: "ledger", name: "Activity Ledger", sub: `${compactNumber(s.ledgerEvents)} events · append only`, live: s.ledgerEvents > 0 },
    { icon: "memory", name: "Memory", sub: `${s.memories} stored · ${s.preferences} preferences`, live: s.memories > 0 },
    { icon: "cube", name: "Durable Jobs", sub: `${s.jobsRunning} running · ${s.jobsQueued} queued`, live: s.jobsRunning > 0 },
    {
      icon: "link",
      name: "Auto-derive",
      sub: s.linkedIntegrations.length ? `${s.linkedIntegrations.join(" · ")} linked` : "Not linked · Milestone 2",
      live: s.linkedIntegrations.length > 0,
    },
  ];

  return (
    <section className="panel span-3" aria-labelledby="sys-h">
      <div className="panel-head">
        <h2 id="sys-h" className="panel-title">System overview</h2>
      </div>
      <div className="sys-list">
        {rows.map((r) => (
          <div key={r.name} className={`sys-item ${r.live ? "" : "idle"}`}>
            <Icon name={r.icon} />
            <div>
              <div className="sys-name">{r.name}</div>
              <div className="sys-sub">{r.sub}</div>
            </div>
            <span className="dot" aria-label={r.live ? "active" : "idle"} />
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================ goal orbit

/**
 * One ring per goal. The filled arc is actual progress, the white tick is
 * where elapsed time says the goal should be. The gap between them is paceDelta.
 */
export function GoalOrbit({ view }: { view: DashboardView }) {
  const goals = view.goals.slice(0, 5);
  const size = 300;
  const c = size / 2;
  const stroke = 10;
  const outer = 136;
  const step = 20;

  return (
    <section className="panel hud span-6 orbit-panel" aria-labelledby="orbit-h">
      <div className="panel-head">
        <h2 id="orbit-h" className="panel-title">Goal orbit · actual vs expected</h2>
        <span className="panel-note">computed from ledger</span>
      </div>

      <div className="orbit-wrap">
        <svg
          className="orbit-svg"
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`${view.onPace.count} of ${view.onPace.judgeable} goals on pace`}
        >
          {goals.map((g, i) => {
            const r = outer - i * step;
            const circ = 2 * Math.PI * r;
            const p = g.percentComplete ?? 0;
            const e = g.expectedProgress;
            const angle = e == null ? null : (e * 360 - 90) * (Math.PI / 180);
            return (
              <g key={g.id}>
                <title>
                  {`${g.title}: ${pct(g.percentComplete)} done, ${pct(g.expectedProgress)} expected, ${PACE_DISPLAY[g.paceStatus].label.toLowerCase()}`}
                </title>
                <circle cx={c} cy={c} r={r} fill="none" stroke="#12283f" strokeWidth={stroke} />
                {p > 0 && (
                  <circle
                    cx={c}
                    cy={c}
                    r={r}
                    fill="none"
                    stroke={goalColor(g)}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={`${Math.max(0.5, circ * p)} ${circ}`}
                    transform={`rotate(-90 ${c} ${c})`}
                  />
                )}
                {angle != null && (
                  <line
                    x1={c + (r - 8) * Math.cos(angle)}
                    y1={c + (r - 8) * Math.sin(angle)}
                    x2={c + (r + 8) * Math.cos(angle)}
                    y2={c + (r + 8) * Math.sin(angle)}
                    stroke="var(--ink)"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                )}
              </g>
            );
          })}
          <text x={c} y={c + 6} textAnchor="middle" fill="var(--ink)" fontSize="34" fontWeight="700" className="num">
            {view.onPace.count}/{view.onPace.judgeable}
          </text>
          <text x={c} y={c + 26} textAnchor="middle" fill="var(--ink-3)" fontSize="10" letterSpacing="3" fontFamily="var(--mono)">
            ON PACE
          </text>
        </svg>

        <div>
          <ul className="legend">
            {goals.map((g) => (
              <li key={g.id}>
                <span className="swatch" style={{ background: goalColor(g) }} />
                <span className="name">{g.shortTitle}</span>
                <span className="val">{pct(g.percentComplete)}</span>
              </li>
            ))}
          </ul>
          <div className="legend-key">
            <span className="tick" /> white tick = where today says you should be
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================ active goals

export function ActiveGoals({ view }: { view: DashboardView }) {
  const shown = view.goals.slice(0, 5);
  return (
    <section className="panel span-5" aria-labelledby="goals-h">
      <div className="panel-head">
        <h2 id="goals-h" className="panel-title">Active goals</h2>
        <a className="panel-note" href="/goals" style={{ color: "var(--accent)" }}>All {view.goals.length} ›</a>
      </div>
      <div className="goal-grid">
        {shown.map((g) => (
          <article key={g.id} className={`goal-card ${g.paceStatus}`}>
            <div className="goal-top">
              <span className="goal-title" title={g.title}>{g.shortTitle}</span>
              <span className="goal-val">{g.valueLabel}</span>
            </div>
            <div
              className="bar"
              role="img"
              aria-label={`${pct(g.percentComplete)} complete, ${pct(g.expectedProgress)} expected`}
              title={`${pct(g.percentComplete)} done · ${pct(g.expectedProgress)} expected`}
            >
              <div className="bar-fill" style={{ width: pct(g.percentComplete ?? 0), background: goalColor(g) }} />
              {g.expectedProgress != null && <div className="bar-tick" style={{ left: pct(g.expectedProgress) }} />}
            </div>
            <div className="goal-foot">
              <PaceChip card={g} />
              <span className="goal-due">{g.dueLabel ?? "OPEN"}</span>
            </div>
          </article>
        ))}
        <a className="goal-new" href="/goals/new">+ New goal</a>
      </div>
    </section>
  );
}

// ============================================================ priority

/**
 * One ranked list of actions, from prioritizeActions. Replaces the old
 * attention list and top three: an alert you cannot act on is noise, and a
 * goal slipping with nothing queued shows up as its own row.
 */
export function Priority({ view }: { view: DashboardView }) {
  return (
    <section className="panel span-7" aria-labelledby="prio-h">
      <div className="panel-head">
        <h2 id="prio-h" className="panel-title">Priority</h2>
        <span className="panel-note">
          {view.overdueP1Count > 0 && <span className="tone-bad">▲ {view.overdueP1Count} overdue P1 · </span>}
          engine, not a model
        </span>
      </div>

      <div className="prio-wrap">
        {view.priority.length === 0 ? (
          <p className="empty">Nothing open and nothing slipping. Add a task, or enjoy the quiet.</p>
        ) : (
          <ol className="prio">
            {view.priority.map((r, i) => (
              <li
                key={r.key}
                className={r.kind === "no_next_action" ? "orphan" : r.overdueP1 ? "overdue" : undefined}
              >
                <span className="rank-n">{i + 1}</span>
                <div className="prio-body">
                  <div className="rank-title">
                    {r.kind === "no_next_action" && <span aria-hidden="true" className="tone-bad">▲ </span>}
                    {r.title}
                  </div>
                  <ul className="chips" aria-label="Why this is ranked here">
                    {r.chips.map((c) => (
                      <li key={c} className={chipClass(c)}>{c}</li>
                    ))}
                  </ul>
                </div>
                {r.kind === "no_next_action" && (
                  <a className="btn-add" href={`/tasks/new?goal=${encodeURIComponent(r.goalId)}`}>
                    + Add one
                  </a>
                )}
              </li>
            ))}
          </ol>
        )}

        <div className="prio-side">
          <div className="subhead" style={{ marginTop: 0 }}>
            <span>DUE TODAY</span>
            <span>calendar sync · M2</span>
          </div>
          {view.dueToday.length === 0 ? (
            <p className="empty">Nothing else due today.</p>
          ) : (
            <ul className="sched">
              {view.dueToday.map((d) => (
                <li key={d.id} className={d.state}>
                  <span className="t">{d.time}</span>
                  <span className="pip" aria-hidden="true" />
                  <span className="what">{d.title}</span>
                  <span className="when">{d.when}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/** Chips that signal urgency get the status color. Everything else stays neutral. */
function chipClass(chip: string): string {
  if (chip.startsWith("overdue") || chip === "goal at risk" || chip === "goal deadline passed") return "chip-bad";
  if (chip === "due today" || chip === "goal behind pace" || chip === "P1") return "chip-warn";
  if (chip === "blocked" || chip === "too long for now") return "chip-muted";
  return "";
}

// ============================================================ quick commands

export function QuickCommands() {
  // Not wired yet: capture and chat land at build step 5. Tags say when.
  const cmds: { icon: IconName; label: string; tag: string; cost?: boolean }[] = [
    { icon: "plus", label: "Log progress", tag: "step 5" },
    { icon: "check", label: "Add a task", tag: "step 6" },
    { icon: "timer", label: "Start a focus block", tag: "step 5" },
    { icon: "search", label: "Deep research", tag: "~20¢ · M3", cost: true },
    { icon: "chat", label: "Evening review", tag: "M2" },
  ];
  return (
    <section className="panel span-3" aria-labelledby="cmd-h">
      <div className="panel-head">
        <h2 id="cmd-h" className="panel-title">Quick commands</h2>
      </div>
      <div className="cmds">
        {cmds.map((c) => (
          <button key={c.label} type="button" className="cmd" aria-disabled="true" title={`Not wired yet (${c.tag})`}>
            <Icon name={c.icon} />
            <span>{c.label}</span>
            <span className={`tag ${c.cost ? "cost" : ""}`}>{c.tag}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ============================================================ signals

export function Signals({ view }: { view: DashboardView }) {
  const b = view.budget;
  const budgetColor = b.state === "ok" ? "#2dd4bf" : b.state === "warn" ? "var(--warn)" : "var(--bad)";
  const op = view.onPace;
  const paceFrac = op.judgeable > 0 ? op.count / op.judgeable : null;
  const hc = view.signals.habitConsistency;

  const lag = [op.behind ? `${op.behind} behind` : null, op.atRisk ? `${op.atRisk} at risk` : null]
    .filter(Boolean)
    .join(", ");

  return (
    <section className="panel span-4" aria-labelledby="sig-h">
      <div className="panel-head">
        <h2 id="sig-h" className="panel-title">Signals</h2>
      </div>
      <div className="rings">
        {view.aiEnabled ? (
          <div className="ring">
            <Ring value={b.usedFraction} color={budgetColor} label={`Budget used ${pct(b.usedFraction)}`}>
              <text x="50" y="56" textAnchor="middle" fill="var(--ink)" fontSize="18" fontWeight="700">{pct(b.usedFraction)}</text>
            </Ring>
            <div>
              <div className="ring-label">Budget used</div>
              <div className="ring-sub">{fmt(b.spentCents)} / {fmt(b.limitCents)}</div>
            </div>
          </div>
        ) : (
          <div className="ring">
            <Ring value={null} label="AI off">
              <text x="50" y="56" textAnchor="middle" fill="var(--ink-3)" fontSize="16" fontWeight="700">OFF</text>
            </Ring>
            <div>
              <div className="ring-label">AI</div>
              <div className="ring-sub">no model calls</div>
            </div>
          </div>
        )}
        <div className="ring">
          <Ring value={paceFrac} color="var(--warn)" label={`${op.count} of ${op.judgeable} goals on pace`}>
            <text x="50" y="56" textAnchor="middle" fill="var(--ink)" fontSize="18" fontWeight="700">{op.count}/{op.judgeable}</text>
          </Ring>
          <div>
            <div className="ring-label">Goals on pace</div>
            <div className="ring-sub">{lag || "none lagging"}</div>
          </div>
        </div>
        <div className="ring">
          <Ring value={hc} label={`Habit consistency ${pct(hc)}`}>
            <text x="50" y="56" textAnchor="middle" fill="var(--ink)" fontSize="18" fontWeight="700">{hc == null ? "n/a" : pct(hc)}</text>
          </Ring>
          <div>
            <div className="ring-label">Habit consistency</div>
            <div className="ring-sub">last 14 days</div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================ ledger

export function LedgerPanel({ view }: { view: DashboardView }) {
  const days = view.ledger.days;
  const W = 320;
  const H = 110;
  const pad = 10;
  const max = Math.max(1, ...days.map((d) => d.count));
  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(1, days.length - 1);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const points = days.map((d, i) => `${x(i)},${y(d.count)}`).join(" ");
  const last = days.length - 1;

  return (
    <section className="panel span-4" aria-labelledby="ledger-h">
      <div className="panel-head">
        <h2 id="ledger-h" className="panel-title">Ledger · last 14 days</h2>
        <span className="panel-note">append only</span>
      </div>

      <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ledger events per day, last 14 days">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={pad} x2={W - pad} y1={pad + f * (H - pad * 2)} y2={pad + f * (H - pad * 2)} stroke="#12283f" strokeWidth={1} />
        ))}
        <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
        {days.map((d, i) => (
          <g key={d.date}>
            <circle cx={x(i)} cy={y(d.count)} r={i === last ? 5 : 3.5} fill={i === last ? "var(--ink)" : "var(--panel)"} stroke="var(--accent)" strokeWidth={2} />
            {/* Oversized invisible hit target so the native tooltip is easy to reach. */}
            <circle cx={x(i)} cy={y(d.count)} r={12} fill="transparent">
              <title>{`${shortDate(d.date)}: ${d.count} event${d.count === 1 ? "" : "s"}`}</title>
            </circle>
          </g>
        ))}
      </svg>
      <div className="spark-axis">
        <span>{days[0] ? shortDate(days[0].date) : ""}</span>
        <span>TODAY</span>
      </div>
      {view.ledger.autoSummary && (
        <p className="auto-line">
          <span className="dot" aria-hidden="true" /> {view.ledger.autoSummary}
          <span className="auto-tag">auto-derived · last 24h</span>
        </p>
      )}

      <div className="stats">
        <div>
          <div className="stat-v">{compactNumber(view.ledger.total)}</div>
          <div className="stat-l">total events</div>
        </div>
        <div>
          <div className="stat-v">{compactNumber(view.ledger.thisWeek)}</div>
          <div className="stat-l">this week</div>
        </div>
        <div>
          <div className="stat-v accent">{pct(view.ledger.autoDerivedShare)}</div>
          <div className="stat-l">auto-derived</div>
        </div>
      </div>
    </section>
  );
}

// ============================================================ model routing

const TIER_NAME = { default: "GPT-6 Luna", advanced: "GPT-6 Sol", embedding: "Embeddings" } as const;
const TIER_PIP = { default: "var(--accent)", advanced: "var(--warn)", embedding: "#60a5fa" } as const;

export function ModelRouting({ view }: { view: DashboardView }) {
  const state = view.budget.state;
  const stateLabel = state === "ok" ? "BUDGET OK" : state.replace("_", " ").toUpperCase();
  const cache = view.routing.cachedInputShare;

  return (
    <section className="panel span-4" aria-labelledby="route-h">
      <div className="panel-head">
        <h2 id="route-h" className="panel-title">Model routing</h2>
        {view.aiEnabled ? (
          <span className="panel-note" style={{ color: state === "ok" ? "var(--good)" : "var(--warn)" }}>{stateLabel}</span>
        ) : (
          <span className="panel-note">AI OFF</span>
        )}
      </div>
      <div className="routes">
        {view.routing.rows.map((r) => (
          <div key={r.tier} className={`route ${r.tier}`} title={r.modelId}>
            <span className="pip" style={{ background: TIER_PIP[r.tier] }} />
            <div>
              <div className="route-name">{TIER_NAME[r.tier]}</div>
              <div className="route-sub">
                {r.role}
                {r.tier !== "embedding" && ` · ${r.pricing}`}
              </div>
            </div>
            {view.aiEnabled ? (
              <div className="route-nums">
                {r.tier !== "embedding" && <div className="route-share">{view.routing.totalCalls ? pct(r.share) : "0%"}</div>}
                <div className="route-cost">{fmt(r.costCents)}</div>
              </div>
            ) : (
              <div className="route-nums route-cost">off</div>
            )}
          </div>
        ))}
        <div className="route blocked" title="$10 / $50 per M. Builds this repo, never runs in it.">
          <span className="pip" style={{ background: "var(--muted)" }} />
          <div>
            <div className="route-name">Claude Fable 5.1</div>
            <div className="route-sub">build agent · blocked at runtime</div>
          </div>
          <div className="route-nums route-cost">blocked</div>
        </div>
      </div>
      {view.aiEnabled && (
      <div className="cache-row">
        <span>Cached input</span>
        <div className="bar" role="img" aria-label={`Cached input ${pct(cache)}`}>
          <div className="bar-fill" style={{ width: pct(cache ?? 0) }} />
        </div>
        <span className="mono">{pct(cache)}</span>
      </div>
      )}
    </section>
  );
}
