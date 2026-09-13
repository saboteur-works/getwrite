// Last Updated: 2026-09-12

/**
 * `awaitWorkerOutcome` must resolve to whichever of `message`/`exit`/`error`
 * fires first on a forked import worker, and must never settle a second time
 * once one of them has.
 */
import { describe, it, expect, vi } from "vitest";
import {
  awaitWorkerOutcome,
  type WorkerLike,
} from "../../src/scrivener-import/await-worker-outcome";
import type { ImportOutcome } from "../../src/scrivener-import/handle-import-request";

/** A fake `WorkerLike` whose events can be fired manually from a test. */
function createFakeWorker(): {
  worker: WorkerLike;
  emit: (event: "message" | "exit" | "error", ...args: unknown[]) => void;
} {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {
    message: [],
    exit: [],
    error: [],
  };

  return {
    worker: {
      on(event, listener) {
        listeners[event].push(listener);
      },
    },
    emit(event, ...args) {
      for (const listener of listeners[event]) {
        listener(...args);
      }
    },
  };
}

describe("awaitWorkerOutcome", () => {
  it("resolves with the outcome carried by a message event", async () => {
    const { worker, emit } = createFakeWorker();
    const outcome: ImportOutcome = {
      kind: "success",
      projectId: "abc",
      projectRoot: "/projects/abc",
      folderCount: 1,
      resourceCount: 2,
      tagCount: 0,
      report: "report text",
    };

    const promise = awaitWorkerOutcome(worker);
    emit("message", outcome);

    await expect(promise).resolves.toEqual(outcome);
  });

  it("resolves with a fatal outcome including the exit code when the worker exits before any message", async () => {
    const { worker, emit } = createFakeWorker();

    const promise = awaitWorkerOutcome(worker);
    emit("exit", 1);

    const result = await promise;
    expect(result.kind).toBe("fatal");
    expect(result.kind === "fatal" && result.message).toContain("1");
  });

  it("resolves with a fatal outcome including the exit code when the worker exits with code null", async () => {
    const { worker, emit } = createFakeWorker();

    const promise = awaitWorkerOutcome(worker);
    emit("exit", null);

    const result = await promise;
    expect(result.kind).toBe("fatal");
    expect(result.kind === "fatal" && result.message).toContain("null");
  });

  it("resolves with a generic, path-free fatal outcome when the worker errors before any message, without leaking the raw error message (FR-3)", async () => {
    const { worker, emit } = createFakeWorker();
    const error = new Error(
      'ENOENT: no such file or directory, open "/private/tmp/foo/Old.scriv"',
    );

    const promise = awaitWorkerOutcome(worker);
    emit("error", error);

    const result = await promise;
    expect(result.kind).toBe("fatal");
    expect(JSON.stringify(result)).not.toContain("/private/tmp/foo");
    expect(JSON.stringify(result)).not.toContain("/private/tmp");
  });

  it("invokes the onWorkerError callback with the raw error, for server-side logging, while still resolving a generic outcome", async () => {
    const { worker, emit } = createFakeWorker();
    const error = new Error(
      'ENOENT: no such file or directory, open "/private/tmp/foo/Old.scriv"',
    );
    const onWorkerError = vi.fn();

    const promise = awaitWorkerOutcome(worker, onWorkerError);
    emit("error", error);

    const result = await promise;
    expect(onWorkerError).toHaveBeenCalledTimes(1);
    expect(onWorkerError).toHaveBeenCalledWith(error);
    expect(result.kind).toBe("fatal");
    expect(JSON.stringify(result)).not.toContain("/private/tmp/foo");
  });

  it("settles only once: a later exit/error after a message produces no second resolution", async () => {
    const { worker, emit } = createFakeWorker();
    const outcome: ImportOutcome = {
      kind: "success",
      projectId: "abc",
      projectRoot: "/projects/abc",
      folderCount: 0,
      resourceCount: 0,
      tagCount: 0,
      report: "report text",
    };

    const promise = awaitWorkerOutcome(worker);
    const thenSpy = vi.fn();
    const settled = promise.then(thenSpy);

    emit("message", outcome);
    // Later events on the same worker must not cause a second resolution or
    // an unhandled rejection.
    emit("exit", 1);
    emit("error", new Error("late"));

    await settled;

    expect(thenSpy).toHaveBeenCalledTimes(1);
    expect(thenSpy).toHaveBeenCalledWith(outcome);
    await expect(promise).resolves.toEqual(outcome);
  });

  it("settles only once: a later message after an exit produces no second resolution", async () => {
    const { worker, emit } = createFakeWorker();

    const promise = awaitWorkerOutcome(worker);
    const thenSpy = vi.fn();
    const settled = promise.then(thenSpy);

    emit("exit", 1);
    emit("message", {
      kind: "success",
      projectId: "later",
      projectRoot: "/projects/later",
      folderCount: 0,
      resourceCount: 0,
      tagCount: 0,
      report: "",
    });

    await settled;

    expect(thenSpy).toHaveBeenCalledTimes(1);
    const result = await promise;
    expect(result.kind).toBe("fatal");
  });
});
