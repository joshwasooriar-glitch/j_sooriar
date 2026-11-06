"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icons";
import { FOCUS_CAP_MS, formatElapsed } from "@/lib/focus";
import { focusStore } from "./focus-store";

interface Result {
  reply: string;
  eventId?: number;
  sentAt: number;
}

const UNDO_MS = 30_000;

/**
 * Start / Stop a focus block. Nothing is written on Start. Stop writes one
 * focus_session event with the monotonic elapsed time; the database caps it at
 * 4 hours. Two variants share one session: the sidebar button and the quick
 * command.
 */
export function FocusButton({ variant }: { variant: "primary" | "cmd" }) {
  const router = useRouter();
  const s = useSyncExternalStore(focusStore.subscribe, focusStore.get, focusStore.getServer);
  const [, tick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  // Re-render once a second to show the time. Elapsed is always recomputed from
  // the clock, so a late or skipped tick changes nothing that gets recorded.
  useEffect(() => {
    if (s.status !== "running") return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.status]);

  async function stop() {
    if (s.status !== "running") return;
    const elapsed = focusStore.elapsed();
    const ref = s.ref;
    setBusy(true);
    const sentAt = performance.now();
    try {
      const res = await fetch("/api/focus", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ elapsed_ms: Math.round(elapsed), ref }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok && !json.reply) throw new Error(json.error ?? "Could not record the focus block.");
      focusStore.clear();
      setResult({ reply: json.reply, eventId: json.kind === "recorded" ? json.eventId : undefined, sentAt });
      if (json.kind === "recorded") router.refresh();
    } catch (e) {
      // Keep the session running so Stop can be retried.
      setResult({ reply: e instanceof Error ? e.message : "Could not record the focus block.", sentAt });
    } finally {
      setBusy(false);
    }
  }

  async function undo(eventId: number) {
    setBusy(true);
    try {
      const res = await fetch("/api/undo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event_id: eventId }),
      });
      const json = await res.json().catch(() => ({}));
      setResult({ reply: json.reply ?? "Undo failed.", sentAt: -Infinity });
      if (json.kind === "undone") router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const running = s.status === "running";
  const elapsed = running ? focusStore.elapsed() : 0;
  const over = elapsed > FOCUS_CAP_MS;
  const label = running ? `Stop focus · ${formatElapsed(elapsed)}` : variant === "cmd" ? "Start a focus block" : "Start focus block";
  const title = running
    ? `${s.recovered ? "Recovered after a reload. " : ""}${over ? "Past 4 hours: it will be recorded as 240 minutes." : "Stop writes one focus session to the ledger."}`
    : "Nothing is recorded until you stop.";

  const button =
    variant === "primary" ? (
      <button type="button" className={`btn-primary ${running ? "running" : ""}`} onClick={running ? stop : focusStore.start} disabled={busy} title={title}>
        {label}
      </button>
    ) : (
      <button type="button" className={`cmd live ${running ? "running" : ""}`} onClick={running ? stop : focusStore.start} disabled={busy} title={title}>
        <Icon name="timer" />
        <span>{label}</span>
      </button>
    );

  return (
    <div className="focus-wrap">
      {button}
      {result && !running && <FocusResult result={result} busy={busy} onUndo={undo} onClose={() => setResult(null)} />}
    </div>
  );
}

function FocusResult({
  result,
  busy,
  onUndo,
  onClose,
}: {
  result: Result;
  busy: boolean;
  onUndo: (id: number) => void;
  onClose: () => void;
}) {
  const [left, setLeft] = useState(() => Math.max(0, UNDO_MS - (performance.now() - result.sentAt)));
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, UNDO_MS - (performance.now() - result.sentAt))), 250);
    return () => clearInterval(id);
  }, [result.sentAt]);
  return (
    <div className="focus-result" role="status">
      <span>{result.reply}</span>
      {result.eventId != null && left > 0 && (
        <button type="button" className="btn-add" disabled={busy} onClick={() => onUndo(result.eventId!)}>
          Undo ({Math.ceil(left / 1000)}s)
        </button>
      )}
      <button type="button" className="ask-close" onClick={onClose} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
