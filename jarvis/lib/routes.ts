/**
 * Every navigable page and what state it is in. The sidebar tags and the
 * not-built pages both read this, and tests/routes.test.ts checks it against
 * the files in app/, so a tag cannot drift from reality.
 */

export type Milestone = "built" | "M2" | "M3" | "M5" | "Unscheduled";

export interface RouteInfo {
  href: string;
  label: string;
  milestone: Milestone;
  /** For an unbuilt page: one sentence on what it will do. */
  summary?: string;
}

export const ROUTES: RouteInfo[] = [
  { href: "/", label: "Command Center", milestone: "built" },
  { href: "/goals", label: "Goals", milestone: "built" },
  { href: "/tasks", label: "Tasks", milestone: "built" },
  {
    href: "/timeline",
    label: "Timeline",
    milestone: "M2",
    summary: "Goal bars with milestone pins, a today marker, and expected vs actual progress over time.",
  },
  { href: "/activity", label: "Activity Ledger", milestone: "built" },
  {
    href: "/calendar",
    label: "Calendar",
    milestone: "M2",
    summary: "Today's schedule from Google Calendar sync, which also feeds the score's schedule adherence.",
  },
  {
    href: "/projects",
    label: "Projects",
    milestone: "Unscheduled",
    summary: "Projects tied to goals and repositories. The table exists; no milestone owns the page yet.",
  },
  {
    href: "/memory",
    label: "Memory",
    milestone: "Unscheduled",
    summary: "Browse, correct and forget what JARVIS remembers. Stored today; no milestone owns the page yet.",
  },
  {
    href: "/jobs",
    label: "Jobs",
    milestone: "M3",
    summary: "The durable job center: running and queued jobs, their checkpoints, and cost against each ceiling.",
  },
  {
    href: "/budget",
    label: "Budget",
    milestone: "M3",
    summary: "Spend by feature and model with the guard thresholds. Month-to-date spend is already on the dashboard.",
  },
  {
    href: "/voice",
    label: "Voice",
    milestone: "M5",
    summary: "Push-to-talk with local speech to text and text to speech. Scheduled for December 7.",
  },
];

export function routeInfo(href: string): RouteInfo {
  const r = ROUTES.find((x) => x.href === href);
  if (!r) throw new Error(`No route registered for ${href}`);
  return r;
}

/** The tag shown in the sidebar, or null for built pages. */
export function milestoneTag(m: Milestone): string | null {
  if (m === "built") return null;
  if (m === "M5") return "DEC 7";
  return m === "Unscheduled" ? "LATER" : m;
}
