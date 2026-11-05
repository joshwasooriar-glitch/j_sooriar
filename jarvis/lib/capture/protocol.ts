/**
 * The /api/capture request and response shapes, shared by the route, chat and
 * the Ask bar. Zod at the boundary; the client imports the types only.
 */

import { z } from "zod";
import type { CountOption } from "./plan";

export const CaptureRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("plan"), text: z.string().trim().min(1).max(1000) }),
  z.object({ action: z.literal("complete_task"), task_id: z.string().uuid(), text: z.string().max(1000).optional() }),
  z.object({
    action: z.literal("log_progress"),
    goal_id: z.string().uuid(),
    quantity: z.number().positive().max(1000),
    /** Client-generated, so a double click logs once. */
    ref: z.string().min(8).max(100),
    text: z.string().max(1000).optional(),
  }),
]);
export type CaptureRequest = z.infer<typeof CaptureRequest>;

export type CaptureResponse =
  | { kind: "completed"; reply: string; eventId: number; undoUntil: string }
  | { kind: "logged"; reply: string; eventId: number; undoUntil: string }
  | { kind: "task_picker"; reply: string; options: { taskId: string; title: string; score: number }[] }
  | { kind: "confirm_count"; reply: string; options: CountOption[]; text: string }
  | { kind: "no_match"; reply: string }
  | { kind: "demo"; reply: string }
  | { kind: "error"; reply: string; code?: string };

export const UndoRequest = z.object({ event_id: z.number().int().positive() });
