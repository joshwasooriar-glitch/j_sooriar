"use client";

import { Icon } from "@/components/ui/icons";
import { FOCUS_CAPTURE_EVENT } from "./AskBar";

/** Quick command: puts the Ask bar into Log mode and focuses it. */
export function LogProgressCommand() {
  return (
    <button type="button" className="cmd live" onClick={() => window.dispatchEvent(new Event(FOCUS_CAPTURE_EVENT))}>
      <Icon name="plus" />
      <span>Log progress</span>
      <span className="tag">$0</span>
    </button>
  );
}
