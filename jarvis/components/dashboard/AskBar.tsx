"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icons";

interface Reply {
  reply: string;
  status: "ok" | "needs_confirmation" | "budget_blocked" | "unavailable";
  deterministic: boolean;
  intent: string;
}

/**
 * The Ask bar. Posts to /api/chat and shows the answer above the bar.
 * Holds only the in-flight question and last reply; nothing the dashboard
 * shows lives here, so a refresh loses nothing that matters.
 */
export function AskBar() {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [reply, setReply] = useState<Reply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAsked, setLastAsked] = useState("");

  async function ask(text: string, confirmAdvanced = false) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, confirmAdvanced }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Request failed.");
      setReply(body as Reply);
      setLastAsked(text);
      setMessage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ask-wrap">
      {(reply || error) && (
        <div className="ask-reply" role="status" aria-live="polite">
          {error ? (
            <p className="tone-bad">{error}</p>
          ) : (
            reply && (
              <>
                <p className="ask-text">{reply.reply}</p>
                <div className="ask-meta">
                  <span>{reply.deterministic ? "engine · $0" : reply.status === "ok" ? "model" : reply.status.replace("_", " ")}</span>
                  {reply.status === "needs_confirmation" && (
                    <button type="button" className="btn-add" onClick={() => ask(lastAsked, true)} disabled={pending}>
                      Use the advanced model
                    </button>
                  )}
                  <button type="button" className="ask-close" onClick={() => { setReply(null); setError(null); }} aria-label="Dismiss">
                    ×
                  </button>
                </div>
              </>
            )
          )}
        </div>
      )}

      <form
        className="ask"
        onSubmit={(e) => {
          e.preventDefault();
          if (message.trim() && !pending) void ask(message.trim());
        }}
      >
        <Icon name="chat" />
        <input
          name="q"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-label="Ask JARVIS"
          placeholder={pending ? "Thinking..." : "How are we doing in terms of progress towards the goals?"}
          autoComplete="off"
          disabled={pending}
          maxLength={2000}
        />
        <span className="mic" title="Voice is Milestone 5, Dec 7" aria-label="Voice input, not available until Milestone 5">
          <Icon name="mic" size={16} />
        </span>
      </form>
    </div>
  );
}
