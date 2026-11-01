import { describe, it, expect, afterEach } from "vitest";
import {
  flushPendingSaves,
  registerSaveFlusher,
  trackSave,
} from "../../src/lib/pending-saves";

describe("flushPendingSaves", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
  });

  it("reports success when nothing is waiting", async () => {
    await expect(flushPendingSaves()).resolves.toBe(true);
  });

  it("waits for a save the flusher starts", async () => {
    let finish: (ok: boolean) => void = () => {};
    cleanups.push(
      registerSaveFlusher("queued", () => {
        trackSave(new Promise<boolean>((resolve) => (finish = resolve)));
      }),
    );
    let isSettled = false;
    const result = flushPendingSaves().then((ok) => {
      isSettled = true;
      return ok;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(isSettled).toBe(false);
    finish(true);
    await expect(result).resolves.toBe(true);
  });

  it("waits for a save already in progress", async () => {
    let finish: (ok: boolean) => void = () => {};
    trackSave(new Promise<boolean>((resolve) => (finish = resolve)));
    const result = flushPendingSaves();
    finish(true);
    await expect(result).resolves.toBe(true);
  });

  it("reports failure when any save fails", async () => {
    trackSave(Promise.resolve(true));
    trackSave(Promise.resolve(false));
    await expect(flushPendingSaves()).resolves.toBe(false);
  });

  it("reports failure when a tracked save rejects", async () => {
    trackSave(Promise.reject(new Error("network")));
    await expect(flushPendingSaves()).resolves.toBe(false);
  });

  it("finishes queued rich-text saves before sending newer Markdown", async () => {
    const order: string[] = [];
    let finish: (ok: boolean) => void = () => {};
    cleanups.push(
      registerSaveFlusher("source", () => {
        order.push("source");
      }),
      registerSaveFlusher("queued", () => {
        order.push("queued");
        trackSave(new Promise<boolean>((resolve) => (finish = resolve)));
      }),
    );
    const result = flushPendingSaves();
    await new Promise((resolve) => setImmediate(resolve));
    expect(order).toEqual(["queued"]);
    finish(true);
    await expect(result).resolves.toBe(true);
    expect(order).toEqual(["queued", "source"]);
  });

  it("stops calling a flusher once it is unregistered", async () => {
    let calls = 0;
    registerSaveFlusher("queued", () => {
      calls += 1;
    })();
    await flushPendingSaves();
    expect(calls).toBe(0);
  });
});
