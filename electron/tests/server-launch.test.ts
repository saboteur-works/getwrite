/**
 * Feature 80, Task 9 (FR-11 b, c): the order of events at launch. Nothing
 * carrying the window secret is installed, and the local origin is not loaded,
 * until the forked server has been confirmed.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ServerExitedError,
  ServerNotReadyError,
} from "../src/sharing/server-readiness";
import {
  createExitSignal,
  describeLaunchFailure,
  runLaunchSequence,
} from "../src/sharing/server-launch";

function harness(confirm: () => Promise<void>, installThrows = false) {
  const calls: string[] = [];
  const failures: string[] = [];
  return {
    calls,
    failures,
    steps: {
      confirmServer: async () => {
        calls.push("confirm:start");
        await confirm();
        calls.push("confirm:done");
      },
      installWindowSecret: () => {
        calls.push("install");
        if (installThrows) throw new Error("install failed");
      },
      loadLocalOrigin: () => {
        calls.push("load");
      },
      showFailure: (message: string) => {
        failures.push(message);
      },
    },
  };
}

describe("runLaunchSequence", () => {
  it("confirms, then installs the window secret, then loads the origin", async () => {
    const h = harness(async () => undefined);
    await runLaunchSequence(h.steps);
    expect(h.calls).toEqual([
      "confirm:start",
      "confirm:done",
      "install",
      "load",
    ]);
    expect(h.failures).toEqual([]);
  });

  it("neither installs nor loads while confirmation is pending", async () => {
    let release: () => void = () => undefined;
    const h = harness(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    const running = runLaunchSequence(h.steps);
    await Promise.resolve();
    await Promise.resolve();
    expect(h.calls).toEqual(["confirm:start"]);
    release();
    await running;
    expect(h.calls.slice(-2)).toEqual(["install", "load"]);
  });

  it("a timeout shows the failure and never installs or loads (a foreign page is never loaded)", async () => {
    const h = harness(async () => {
      throw new ServerNotReadyError();
    });
    await runLaunchSequence(h.steps);
    expect(h.calls).toEqual(["confirm:start"]);
    expect(h.failures).toEqual([
      "Server failed to start: Error: Server did not start in time",
    ]);
  });

  it("an exit before readiness shows a distinct failure and never installs or loads", async () => {
    const h = harness(async () => {
      throw new ServerExitedError(0);
    });
    await runLaunchSequence(h.steps);
    expect(h.calls).toEqual(["confirm:start"]);
    expect(h.failures).toEqual([
      "Server stopped before it was ready (exit code 0)",
    ]);
  });

  it("a failing install shows the failure and does not load", async () => {
    const h = harness(async () => undefined, true);
    await runLaunchSequence(h.steps);
    expect(h.calls).toEqual(["confirm:start", "confirm:done", "install"]);
    expect(h.failures).toEqual([
      "Server failed to start: Error: install failed",
    ]);
  });

  it("describes an exit with no code without printing null as a code", () => {
    expect(describeLaunchFailure(new ServerExitedError(null))).toBe(
      "Server stopped before it was ready (no exit code)",
    );
  });
});

describe("createExitSignal", () => {
  it("tells listeners the code, once, and tells a late listener at once", () => {
    const signal = createExitSignal();
    const early: Array<number | null> = [];
    signal.watch((code) => early.push(code));
    signal.fire(3);
    signal.fire(9);
    expect(early).toEqual([3]);
    const late: Array<number | null> = [];
    signal.watch((code) => late.push(code));
    expect(late).toEqual([3]);
  });
});

describe("main.ts wiring (read from source; main.ts cannot be imported)", () => {
  const main = readFileSync(path.join(__dirname, "../src/main.ts"), "utf8");

  it("installs the window secret in one place, defined before app start, not in the ready callback", () => {
    const uses = main.match(/installWindowSecret\(/g) ?? [];
    // The import is a bare name; exactly one call.
    expect(uses).toHaveLength(1);
    expect(main.indexOf("installWindowSecret(")).toBeLessThan(
      main.indexOf("app.whenReady()"),
    );
  });

  it("hands the forked server the readiness key, separately from the window secret", () => {
    expect(main).toMatch(/\[READINESS_KEY_ENV\]:\s*readinessKey/);
    expect(main).toMatch(/GETWRITE_WINDOW_SECRET:\s*windowSecret/);
    expect(main).toMatch(
      /readinessKey\s*=\s*createReadinessKey\(randomBytes\)/,
    );
  });

  it("neither secret is logged or sent over IPC", () => {
    expect(main).not.toMatch(/\blog\([^)]*(windowSecret|readinessKey)/);
    expect(main).not.toMatch(
      /(send|handle|invoke|postMessage)\([^)]*(windowSecret|readinessKey)/,
    );
  });

  it("the readiness wait is given the readiness key and the exit signal, not the window secret", () => {
    const call = main.slice(main.indexOf("waitForServer({"));
    const block = call.slice(0, call.indexOf("})"));
    expect(block).toMatch(/key:\s*readinessKey/);
    expect(block).toMatch(/watchExit:\s*serverExit\.watch/);
    expect(block).not.toMatch(/windowSecret/);
  });

  it("tells the exit signal when the server exits", () => {
    expect(main).toMatch(/serverExit\.fire\(code\)/);
  });
});
