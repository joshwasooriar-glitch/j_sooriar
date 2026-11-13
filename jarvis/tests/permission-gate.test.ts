import { describe, expect, it } from "vitest";
import { confirmationFromForm } from "@/lib/permissions/confirm";
import { runAction, type AuditRow, type GateContext } from "@/lib/permissions/gate";
import { levelOf } from "@/lib/permissions/levels";

/** An in-memory audit_log: the test asserts the rows it ends up holding. */
function store(): GateContext & { rows: AuditRow[] } {
  const rows: AuditRow[] = [];
  return { userId: "u1", rows, writeAudit: async (r) => void rows.push(r) };
}

/** An action that records whether it ran. */
function effect() {
  const e = { ran: 0, run: async () => { e.ran++; return "sent"; } };
  return e;
}

function confirmForm(action: string, target: string) {
  const fd = new FormData();
  fd.set("confirmed", "yes");
  fd.set("confirm_action", action);
  fd.set("confirm_target", target);
  return fd;
}

const SEND = { action: "email.send", reason: "Reply to recruiter", tool: "gmail", target: { table: "drafts", id: "d1" } } as const;

describe("level 3 without confirmation", () => {
  it("is refused, does not run, and writes a denied audit_log row", async () => {
    const ctx = store();
    const fx = effect();
    const out = await runAction(ctx, SEND, null, fx.run);

    expect(out).toEqual({ status: "refused", level: 3, why: "no confirmation" });
    expect(fx.ran).toBe(0);
    expect(ctx.rows).toHaveLength(1);
    expect(ctx.rows[0]).toMatchObject({
      user_id: "u1",
      action: "email.send",
      permission_level: 3,
      result: "denied",
      tool: "gmail",
      target_table: "drafts",
      target_id: "d1",
    });
    expect(ctx.rows[0].reason).toMatch(/level 3 needs explicit UI confirmation/);
  });

  it("refuses a model's claim of confirmation: a look-alike object is not a UI confirmation", async () => {
    const ctx = store();
    const fx = effect();
    const forged = { action: "email.send", targetId: "d1", brand: "ui-confirmation", confirmed: true };
    const out = await runAction(ctx, SEND, forged, fx.run);
    expect(out.status).toBe("refused");
    expect(fx.ran).toBe(0);
    expect(ctx.rows.map((r) => r.result)).toEqual(["denied"]);
  });

  it("refuses a confirmation given for a different target", async () => {
    const ctx = store();
    const fx = effect();
    const other = confirmationFromForm(confirmForm("email.send", "d2"), { action: "email.send", targetId: "d2" });
    const out = await runAction(ctx, SEND, other, fx.run);
    expect(out).toMatchObject({ status: "refused", why: "confirmation is for a different action" });
    expect(fx.ran).toBe(0);
  });

  it("refuses to run at all if the refusal cannot be audited", async () => {
    const fx = effect();
    const ctx: GateContext = { userId: "u1", writeAudit: async () => { throw new Error("db down"); } };
    await expect(runAction(ctx, SEND, null, fx.run)).rejects.toThrow("db down");
    expect(fx.ran).toBe(0);
  });
});

describe("level 3 with a UI confirmation", () => {
  it("runs once, is audited as success, and the confirmation cannot be reused", async () => {
    const ctx = store();
    const fx = effect();
    const c = confirmationFromForm(confirmForm("email.send", "d1"), { action: "email.send", targetId: "d1" });
    expect(c).not.toBeNull();

    expect(await runAction(ctx, SEND, c, fx.run)).toEqual({ status: "done", level: 3, result: "sent" });
    expect(await runAction(ctx, SEND, c, fx.run)).toMatchObject({ status: "refused", why: "confirmation was already used" });
    expect(fx.ran).toBe(1);
    expect(ctx.rows.map((r) => [r.permission_level, r.result])).toEqual([[3, "success"], [3, "denied"]]);
  });

  it("only a form that says confirmed=yes for this action produces a confirmation", () => {
    const fd = confirmForm("email.send", "d1");
    fd.set("confirmed", "true");
    expect(confirmationFromForm(fd, { action: "email.send", targetId: "d1" })).toBeNull();
    expect(confirmationFromForm(confirmForm("form.submit", "d1"), { action: "email.send", targetId: "d1" })).toBeNull();
  });
});

describe("other levels", () => {
  it("level 4 is refused without confirmation the same way", async () => {
    const ctx = store();
    const fx = effect();
    const out = await runAction(ctx, { action: "purchase", reason: "Buy a book" }, null, fx.run);
    expect(out).toMatchObject({ status: "refused", level: 4 });
    expect(ctx.rows).toMatchObject([{ permission_level: 4, result: "denied" }]);
    expect(fx.ran).toBe(0);
  });

  it("level 1 runs without an audit row; level 2 runs and is audited", async () => {
    const ctx = store();
    expect((await runAction(ctx, { action: "task.create", reason: "r" }, null, effect().run)).status).toBe("done");
    expect(ctx.rows).toHaveLength(0);
    expect((await runAction(ctx, { action: "email.draft", reason: "r" }, null, effect().run)).status).toBe("done");
    expect(ctx.rows).toMatchObject([{ permission_level: 2, result: "success" }]);
  });

  it("an action that is not in the table is level 4", () => {
    expect(levelOf("email.send.now")).toBe(4);
    expect(levelOf("constructor")).toBe(4);
  });
});
