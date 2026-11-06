/**
 * Realistic captures with the outcome each one must produce.
 *
 * This is the tuning surface for lib/capture/tasks.ts thresholds. If you
 * change AUTO_MIN, SECOND_MAX, PICKER_MIN or the text rules, run the capture
 * tests and read which rows moved. Add a row whenever a real capture surprises
 * you.
 */

import type { Goal, Task } from "@/lib/engine/types";

const task = (id: string, title: string, over: Partial<Task> = {}): Task => ({
  id, title, goal_id: null, project_id: null, milestone_id: null, status: "todo",
  priority: 2, due_at: null, estimate_minutes: null, scale: "micro", ...over,
});

const goal = (id: string, title: string, unit: string, target: number, over: Partial<Goal> = {}): Goal => ({
  id, title, domain_id: null, metric_type: "count", target_value: target, current_value: 0, unit,
  start_date: "2026-09-01", target_date: "2027-01-31", priority: 2, status: "active", ...over,
});

export const OPEN_TASKS: Task[] = [
  task("auth", "Build the auth flow", { status: "in_progress" }),
  task("deep", "Deep work · auth flow"),
  task("pset4", "DATA 101 problem set 4"),
  task("pset3", "DATA 101 problem set 3"),
  task("apps", "Five targeted applications"),
  task("resume", "Rewrite resume bullet points for JARVIS project"),
  task("follow", "Follow up with David Verdugo"),
  task("ctx", "Context packet builder"),
  task("lift", "Upper body session"),
];

export const COUNT_GOALS: { goal: Goal; current: number }[] = [
  { goal: goal("career", "Land a SWE or data role", "applications", 60), current: 11 },
  { goal: goal("train", "Train 4x a week", "sessions", 56), current: 11 },
  { goal: goal("climb", "Climb 20 sessions", "sessions", 20), current: 4 },
  // Nouns from the title, not the unit: what people actually say.
  { goal: goal("affirm", "Manifestation + Affirmations", "times said", 100), current: 7 },
  { goal: goal("books", "Read 12 books", "finished", 12), current: 2 },
  { goal: goal("club", "Book club", "meetings", 10), current: 1 },
  { goal: goal("meditate", "Meditation habit", "sessions", 60), current: 9 },
  // Not count goals: never matched for quantities.
  { goal: goal("jarvis", "Ship JARVIS V1", "%", 100, { metric_type: "percent" }), current: 24 },
];

export type Expected =
  | { kind: "complete_task"; taskId: string; reason?: "exact" | "confident" }
  | { kind: "task_picker"; taskIds: string[] }
  | { kind: "confirm_count"; options: { goalId: string; quantity: number }[] }
  | { kind: "no_match" };

export const CAPTURE_CASES: { text: string; expect: Expected; why: string }[] = [
  {
    text: "I finished the auth flow",
    expect: { kind: "complete_task", taskId: "auth", reason: "confident" },
    why: "The north star capture. Deep work · auth flow scores 0.5, under the 0.6 second-best limit.",
  },
  {
    text: "done: build the auth flow",
    expect: { kind: "complete_task", taskId: "auth", reason: "exact" },
    why: "Exact normalized title once completion words are stripped.",
  },
  {
    text: "just wrapped up deep work on the auth flow",
    expect: { kind: "complete_task", taskId: "deep", reason: "confident" },
    why: "Full token set of the deep work task; the build task scores 0.5.",
  },
  {
    text: "finished context packet builder",
    expect: { kind: "complete_task", taskId: "ctx", reason: "exact" },
    why: "A title with no leading verb still matches exactly.",
  },
  {
    text: "Finished DATA 101 problem set 4!",
    expect: { kind: "complete_task", taskId: "pset4" },
    why: "Number guard halves problem set 3, which otherwise scores 0.67.",
  },
  {
    text: "completed the problem set",
    expect: { kind: "task_picker", taskIds: ["pset3", "pset4"] },
    why: "Both problem sets match equally; ask, never guess.",
  },
  {
    text: "did an upper body session",
    expect: { kind: "complete_task", taskId: "lift", reason: "confident" },
    why: "No explicit number, so not a count capture even though 'sessions' is a unit. 'did' is stripped as completion language.",
  },
  {
    text: "finished the resume bullets",
    expect: { kind: "task_picker", taskIds: ["resume"] },
    why: "Partial overlap (0.4): one candidate, offered as a yes or no question.",
  },
  {
    text: "followed up with David",
    expect: { kind: "task_picker", taskIds: ["follow"] },
    why: "Stemming meets 'follow'; 0.67 is not high enough to write without asking.",
  },
  {
    text: "sent 3 applications today",
    expect: { kind: "confirm_count", options: [{ goalId: "career", quantity: 3 }] },
    why: "Quantity right before the goal's unit noun.",
  },
  {
    text: "five more job applications",
    expect: { kind: "confirm_count", options: [{ goalId: "career", quantity: 5 }] },
    why: "Number words count, and up to three words may sit between number and unit.",
  },
  {
    text: "3 applications in 2026",
    expect: { kind: "confirm_count", options: [{ goalId: "career", quantity: 3 }] },
    why: "4-digit years and numbers after 'in' are ignored.",
  },
  {
    text: "wrapped up 2 applications and the auth flow",
    expect: { kind: "confirm_count", options: [{ goalId: "career", quantity: 2 }] },
    why: "Counts take precedence, and still need confirming before any write.",
  },
  {
    text: "logged 2 sessions on 11/5",
    expect: {
      kind: "confirm_count",
      options: [
        { goalId: "train", quantity: 2 },
        { goalId: "climb", quantity: 2 },
        { goalId: "meditate", quantity: 2 },
      ],
    },
    why: "Three active count goals share the unit 'sessions': picker. The date is not a quantity.",
  },
  {
    text: "applications due by 5",
    expect: { kind: "no_match" },
    why: "A number after 'by' is a deadline, not a quantity, and no task matches well enough.",
  },
  {
    text: "applied to 4 jobs",
    expect: { kind: "no_match" },
    why: "'jobs' is not the goal's unit noun. Matching on the unit is deliberate; synonyms would guess.",
  },
  // ---- the spoken noun comes from the goal TITLE, not its unit ----
  {
    text: "did 3 affirmations",
    expect: { kind: "confirm_count", options: [{ goalId: "affirm", quantity: 3 }] },
    why: "Found in live acceptance. The unit is 'times said'; 'affirmations' is in the title and is the natural word.",
  },
  {
    text: "said my affirmations 5 times",
    expect: { kind: "confirm_count", options: [{ goalId: "affirm", quantity: 5 }] },
    why: "Every unit word counts, not only the last: '5 times' matches the unit 'times said'.",
  },
  {
    text: "did 5 times said",
    expect: { kind: "confirm_count", options: [{ goalId: "affirm", quantity: 5 }] },
    why: "The literal unit still works.",
  },
  {
    text: "finished two meditations",
    expect: { kind: "confirm_count", options: [{ goalId: "meditate", quantity: 2 }] },
    why: "Title noun 'meditation'. The unit 'sessions' is shared with two other goals, and they must not be offered.",
  },
  {
    text: "read 2 books this week",
    expect: {
      kind: "confirm_count",
      options: [
        { goalId: "books", quantity: 2 },
        { goalId: "club", quantity: 2 },
      ],
    },
    why: "'book' is in two goal titles: picker, never a guess.",
  },
  {
    text: "took 3 weeks off",
    expect: { kind: "no_match" },
    why: "Time words in a title ('Train 4x a week') are a schedule, not the thing counted.",
  },
  {
    text: "logged 3 data points",
    expect: { kind: "confirm_count", options: [{ goalId: "career", quantity: 3 }] },
    why: "Known overreach of title matching ('data' is in 'Land a SWE or data role'). Acceptable only because a count never writes without the confirmation card, where Cancel is one click.",
  },
  {
    text: "done",
    expect: { kind: "no_match" },
    why: "Nothing left after stripping completion language.",
  },
  {
    text: "finished the thing",
    expect: { kind: "no_match" },
    why: "No overlap with any open task.",
  },
];
