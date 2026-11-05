"use client";

import { useState } from "react";

/** A submit button that needs a second click. For actions that cannot be undone. */
export function ConfirmButton({ label, confirmLabel, disabled }: { label: string; confirmLabel: string; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" className="link-btn" disabled={disabled} onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="confirm">
      <button type="submit" className="btn-add danger" disabled={disabled}>
        {confirmLabel}
      </button>
      <button type="button" className="link-btn" onClick={() => setArmed(false)}>
        Keep
      </button>
    </span>
  );
}
