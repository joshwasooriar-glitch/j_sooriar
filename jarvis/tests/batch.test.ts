import { describe, expect, it } from "vitest";
import { assertSameKeys, withDefaults } from "../scripts/lib/batch";

describe("batch insert defaults", () => {
  it("reproduces the bug shape: mixed keys are caught before reaching the database", () => {
    const milestones = [{ title: "M1", status: "active" }, { title: "M2" }];
    expect(() => assertSameKeys("milestones", milestones)).toThrow(/row 1 is missing status/);
  });

  it("fills defaults first, so a row's own value wins", () => {
    const out = withDefaults("tasks", { status: "todo", scale: "micro" }, [
      { title: "a", status: "done" },
      { title: "b", scale: "macro" },
    ]);
    expect(out).toEqual([
      { status: "done", scale: "micro", title: "a" },
      { status: "todo", scale: "macro", title: "b" },
    ]);
  });

  it("still throws when a key is missing from the defaults", () => {
    expect(() => withDefaults("tasks", { status: "todo" }, [{ title: "a", due_at: "x" }, { title: "b" }])).toThrow(
      /tasks: row 1 is missing due_at/,
    );
  });

  it("accepts a single row or an empty batch", () => {
    expect(() => assertSameKeys("x", [{ a: 1 }])).not.toThrow();
    expect(withDefaults("x", {}, [])).toEqual([]);
  });
});
