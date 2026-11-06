"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icons";
import type { CaptureResponse } from "@/lib/capture/protocol";
import type { CountOption } from "@/lib/capture/plan";

/** Window event that switches the bar into Log mode and focuses it. */
export const FOCUS_CAPTURE_EVENT = "jarvis:focus-capture";

interface ChatReply {
  reply: string;
  status: "ok" | "needs_confirmation" | "budget_blocked" | "unavailable" | "ai_off";
  deterministic: boolean;
  intent: string;
  capture?: CaptureResponse;
}

type Shown =
  | { type: "chat"; data: ChatReply; asked: string }
  | { type: "capture"; data: CaptureResponse; text: string; sentAt: number }
  | { type: "info"; text: string; tone?: "bad" | "good" };

const UNDO_MS = 30_000;

/**
 * The Ask bar. Two modes:
 *   Ask: posts to /api/chat (engine answers, model only if AI is on).
 *   Log: posts to /api/capture (deterministic, never a model).
 * Holds only the in-flight text and the last reply. Everything it changes is
 * written to the ledger, and the page is refreshed so the dashboard reflects it.
 */
export function AskBar() {
  const router = useRouter();
  const [mode, setMode] = useState<"ask" | "log">("ask");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onFocus = () => {
      setMode("log");
      inputRef.current?.focus();
    };
    window.addEventListener(FOCUS_CAPTURE_EVENT, onFocus);
    return () => window.removeEventListener(FOCUS_CAPTURE_EVENT, onFocus);
  }, []);

  const post = useCallback(async (url: string, body: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  }, []);

  /** A capture call; sentAt is the client clock when the request left, so Undo expires early, never late. */
  const capture = useCallback(
    async (body: Record<string, unknown>, text: string) => {
      setPending(true);
      const sentAt = performance.now();
      try {
        const { ok, json } = await post("/api/capture", body);
        if (!ok) throw new Error(json.error ?? "Capture failed.");
        setShown({ type: "capture", data: json as CaptureResponse, text, sentAt });
        if (json.kind === "completed" || json.kind === "logged") router.refresh();
      } catch (e) {
        setShown({ type: "info", text: e instanceof Error ? e.message : "Capture failed.", tone: "bad" });
      } finally {
        setPending(false);
      }
    },
    [post, router],
  );

  async function submit(text: string, confirmAdvanced = false) {
    if (mode === "log") {
      setMessage("");
      return capture({ action: "plan", text }, text);
    }
    setPending(true);
    const sentAt = performance.now();
    try {
      const { ok, json } = await post("/api/chat", { message: text, confirmAdvanced });
      if (!ok) throw new Error(json.error ?? "Request failed.");
      const data = json as ChatReply;
      // A progress report answered by capture renders exactly like Log mode.
      setShown(data.capture ? { type: "capture", data: data.capture, text, sentAt } : { type: "chat", data, asked: text });
      if (data.capture?.kind === "completed" || data.capture?.kind === "logged") router.refresh();
      setMessage("");
    } catch (e) {
      setShown({ type: "info", text: e instanceof Error ? e.message : "Request failed.", tone: "bad" });
    } finally {
      setPending(false);
    }
  }

  async function undo(eventId: number) {
    setPending(true);
    try {
      const { json } = await post("/api/undo", { event_id: eventId });
      setShown({ type: "info", text: json.reply ?? json.error ?? "Undo failed.", tone: json.kind === "undone" ? "good" : "bad" });
      if (json.kind === "undone") router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ask-wrap">
      {shown && (
        <div className="ask-reply" role="status" aria-live="polite">
          <ReplyBody
            shown={shown}
            pending={pending}
            onConfirmAdvanced={(q) => submit(q, true)}
            onPickTask={(taskId, text) => capture({ action: "complete_task", task_id: taskId, text }, text)}
            onConfirmCount={(o, ref, text) =>
              capture({ action: "log_progress", goal_id: o.goalId, quantity: o.quantity, ref, text }, text)
            }
            onUndo={undo}
            onDismiss={() => setShown(null)}
          />
        </div>
      )}

      <form
        className="ask"
        onSubmit={(e) => {
          e.preventDefault();
          if (message.trim() && !pending) void submit(message.trim());
        }}
      >
        <button
          type="button"
          className={`mode ${mode}`}
          onClick={() => setMode(mode === "ask" ? "log" : "ask")}
          aria-label={mode === "ask" ? "Mode: ask. Switch to log" : "Mode: log. Switch to ask"}
          title="Ask a question, or log what you finished"
        >
          {mode === "ask" ? "Ask" : "Log"}
        </button>
        <input
          ref={inputRef}
          name="q"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-label={mode === "ask" ? "Ask JARVIS" : "Log what you finished"}
          placeholder={
            pending
              ? "Working..."
              : mode === "ask"
                ? "How are we doing in terms of progress towards the goals?"
                : "What did you finish? e.g. finished the auth flow, or 3 applications"
          }
          autoComplete="off"
          disabled={pending}
          maxLength={1000}
        />
        <span className="mic" title="Voice is Milestone 5, Dec 7" aria-label="Voice input, not available until Milestone 5">
          <Icon name="mic" size={16} />
        </span>
      </form>
    </div>
  );
}

function ReplyBody({
  shown,
  pending,
  onConfirmAdvanced,
  onPickTask,
  onConfirmCount,
  onUndo,
  onDismiss,
}: {
  shown: Shown;
  pending: boolean;
  onConfirmAdvanced: (q: string) => void;
  onPickTask: (taskId: string, text: string) => void;
  onConfirmCount: (o: CountOption, ref: string, text: string) => void;
  onUndo: (eventId: number) => void;
  onDismiss: () => void;
}) {
  const close = (
    <button type="button" className="ask-close" onClick={onDismiss} aria-label="Dismiss">
      ×
    </button>
  );

  if (shown.type === "info") {
    return (
      <>
        <p className={shown.tone === "bad" ? "tone-bad" : shown.tone === "good" ? "tone-good" : "ask-text"}>{shown.text}</p>
        <div className="ask-meta">{close}</div>
      </>
    );
  }

  if (shown.type === "chat") {
    const r = shown.data;
    const label = r.deterministic ? "engine · $0" : r.status === "ok" ? "model" : r.status.replace("_", " ");
    return (
      <>
        <p className="ask-text">{r.reply}</p>
        <div className="ask-meta">
          <span>{label}</span>
          {r.status === "needs_confirmation" && (
            <button type="button" className="btn-add" onClick={() => onConfirmAdvanced(shown.asked)} disabled={pending}>
              Use the advanced model
            </button>
          )}
          {close}
        </div>
      </>
    );
  }

  const c = shown.data;
  switch (c.kind) {
    case "completed":
    case "logged":
      return (
        <>
          <p className="ask-text tone-good">{c.reply}</p>
          <div className="ask-meta">
            <span>capture · $0</span>
            <UndoButton sentAt={shown.sentAt} pending={pending} onUndo={() => onUndo(c.eventId)} />
            {close}
          </div>
        </>
      );
    case "task_picker":
      return (
        <>
          <p className="ask-text">{c.reply}</p>
          <div className="pick">
            {c.options.map((o) => (
              <button key={o.taskId} type="button" className="pick-btn" disabled={pending} onClick={() => onPickTask(o.taskId, shown.text)}>
                {c.options.length === 1 ? "Yes, mark it complete" : o.title}
              </button>
            ))}
            <button type="button" className="pick-btn ghost" onClick={onDismiss}>
              {c.options.length === 1 ? "No" : "None of these"}
            </button>
          </div>
        </>
      );
    case "confirm_count":
      return <CountConfirm c={c} text={shown.text} pending={pending} onConfirm={onConfirmCount} onCancel={onDismiss} />;
    default:
      return (
        <>
          <p className={c.kind === "error" ? "tone-bad" : "ask-text"}>{c.reply}</p>
          <div className="ask-meta">{close}</div>
        </>
      );
  }
}

/** Undo for 30 seconds from when the request was sent. The server enforces its own 30 seconds too. */
function UndoButton({ sentAt, pending, onUndo }: { sentAt: number; pending: boolean; onUndo: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, UNDO_MS - (performance.now() - sentAt)));
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, UNDO_MS - (performance.now() - sentAt))), 250);
    return () => clearInterval(id);
  }, [sentAt]);
  if (left <= 0) return <span>undo expired · reverse it from the Activity Ledger</span>;
  return (
    <button type="button" className="btn-add" onClick={onUndo} disabled={pending}>
      Undo ({Math.ceil(left / 1000)}s)
    </button>
  );
}

function CountConfirm({
  c,
  text,
  pending,
  onConfirm,
  onCancel,
}: {
  c: Extract<CaptureResponse, { kind: "confirm_count" }>;
  text: string;
  pending: boolean;
  onConfirm: (o: CountOption, ref: string, text: string) => void;
  onCancel: () => void;
}) {
  // One ref per confirmation card: a double click logs once.
  const [ref] = useState(() => crypto.randomUUID());
  return (
    <>
      <p className="ask-text">{c.reply}</p>
      <div className="pick">
        {c.options.map((o) => (
          <button key={o.goalId} type="button" className="pick-btn count" disabled={pending} onClick={() => onConfirm(o, ref, text)}>
            <span className="count-goal">{o.goalTitle}</span>
            <span className="count-line">
              +{o.quantity} {o.unit ?? ""} · {fmt(o.current)} → {fmt(o.resulting)}
              {o.target != null ? ` of ${fmt(o.target)}` : ""}
              {o.resultingFraction != null ? ` (${Math.round(o.resultingFraction * 100)}%)` : ""}
            </span>
          </button>
        ))}
        <button type="button" className="pick-btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </>
  );
}

function fmt(n: number): string {
  return Number(n.toFixed(2)).toString();
}
