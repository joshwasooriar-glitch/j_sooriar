/**
 * A confirmation is something Joshwa did in the UI, never something a model
 * concluded. The only way to get one is confirmationFromForm, which reads a
 * submitted confirm form. The gate checks that the object was issued here (a
 * look-alike object is refused), that it names this exact action and target,
 * and that it has not been used: a confirmation never carries to the next
 * action.
 */

const issued = new WeakSet<object>();
const used = new WeakSet<object>();

export interface UiConfirmation {
  readonly action: string;
  readonly targetId: string | null;
  readonly brand: "ui-confirmation";
}

/**
 * The confirm form posts confirm_action, confirm_target and confirmed=yes.
 * Returns null unless all three are present and match what is about to run.
 */
export function confirmationFromForm(fd: FormData, expected: { action: string; targetId: string | null }): UiConfirmation | null {
  if (fd.get("confirmed") !== "yes") return null;
  if (fd.get("confirm_action") !== expected.action) return null;
  const target = fd.get("confirm_target");
  if ((target === null || target === "" ? null : target) !== expected.targetId) return null;
  const c: UiConfirmation = Object.freeze({ action: expected.action, targetId: expected.targetId, brand: "ui-confirmation" });
  issued.add(c);
  return c;
}

/** Why a confirmation does not authorize this action, or null if it does. Consumes it on success. */
export function redeem(c: unknown, action: string, targetId: string | null): string | null {
  if (c === null || c === undefined) return "no confirmation";
  if (typeof c !== "object" || !issued.has(c)) return "confirmation was not issued by the UI";
  const conf = c as UiConfirmation;
  if (conf.action !== action || conf.targetId !== targetId) return "confirmation is for a different action";
  if (used.has(conf)) return "confirmation was already used";
  used.add(conf);
  return null;
}
