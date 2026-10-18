/**
 * Global noise-word IPC handlers (Feature 88, Task 6; FR-9, FR-10, FR-24).
 *
 * The handler module has no `electron` import and receives the user-data
 * directory as an argument, like `createDeviceHandlers`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { createGlobalNoiseWordsHandlers } from "../src/noise-words-ipc";

let dir: string;
let log: ReturnType<typeof vi.fn<(message: string) => void>>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-noise-ipc-"));
  log = vi.fn<(message: string) => void>();
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("createGlobalNoiseWordsHandlers", () => {
  it("get reads the list from the directory it was given", () => {
    fs.writeFileSync(
      path.join(dir, "workspace.json"),
      JSON.stringify({ globalNoiseWords: ["said", "look"] }),
    );
    const handlers = createGlobalNoiseWordsHandlers({ userDataDir: dir, log });
    expect(handlers.get()).toEqual(["said", "look"]);
  });

  it("set writes workspace.json in the directory it was given and returns { ok: true }", () => {
    const handlers = createGlobalNoiseWordsHandlers({ userDataDir: dir, log });
    expect(handlers.set(["said"])).toEqual({ ok: true });
    const stored = JSON.parse(
      fs.readFileSync(path.join(dir, "workspace.json"), "utf-8"),
    ) as { globalNoiseWords: string[] };
    expect(stored.globalNoiseWords).toEqual(["said"]);
    expect(log).not.toHaveBeenCalled();
  });

  it("a thrown write returns { ok: false, message } and logs the message", () => {
    const blocker = path.join(dir, "not-a-directory");
    fs.writeFileSync(blocker, "x");
    const handlers = createGlobalNoiseWordsHandlers({
      userDataDir: path.join(blocker, "child"),
      log,
    });
    const result = handlers.set(["said"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message.length).toBeGreaterThan(0);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      `Failed to save the global noise-word list: ${result.message}`,
    );
  });
});
