import { afterEach, describe, expect, it } from "vitest";
import { focusStore } from "@/components/dashboard/focus-store";

/**
 * useSyncExternalStore requires getSnapshot and getServerSnapshot to return
 * the same reference until the store changes. A fresh object per call made
 * React re-render forever ("The result of getServerSnapshot should be cached").
 */
describe("focusStore snapshots", () => {
  afterEach(() => focusStore.clear());

  it("getServer returns the same object every time", () => {
    expect(Object.is(focusStore.getServer(), focusStore.getServer())).toBe(true);
  });

  it("get returns the same object twice with no change in between", () => {
    const a = focusStore.get();
    const b = focusStore.get();
    expect(Object.is(a, b)).toBe(true);
  });

  it("idle on the client is the same object as the server snapshot", () => {
    expect(Object.is(focusStore.get(), focusStore.getServer())).toBe(true);
  });

  it("changes identity exactly when start or clear changes the state, then stays stable", () => {
    const calls: number[] = [];
    const unsubscribe = focusStore.subscribe(() => calls.push(1));
    const idle = focusStore.get();

    focusStore.start();
    const running = focusStore.get();
    expect(Object.is(running, idle)).toBe(false);
    expect(running.status).toBe("running");
    expect(Object.is(focusStore.get(), running)).toBe(true);

    focusStore.start(); // already running: no change, no notification
    expect(Object.is(focusStore.get(), running)).toBe(true);

    focusStore.clear();
    expect(Object.is(focusStore.get(), focusStore.getServer())).toBe(true);
    expect(calls).toHaveLength(2);
    unsubscribe();
  });

  it("hands out frozen snapshots, so nothing can mutate one in place", () => {
    focusStore.start();
    expect(Object.isFrozen(focusStore.get())).toBe(true);
    expect(Object.isFrozen(focusStore.getServer())).toBe(true);
  });
});
