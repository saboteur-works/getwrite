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

const LOCAL = "http://localhost:7340";
const trusted = { senderFrame: { url: `${LOCAL}/` } };
const isTrustedSender = (url: string | null | undefined): boolean =>
  typeof url === "string" && url.startsWith(`${LOCAL}/`);

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
    const handlers = createGlobalNoiseWordsHandlers({
      userDataDir: dir,
      log,
      isTrustedSender,
    });
    expect(handlers.get(trusted)).toEqual(["said", "look"]);
  });

  it("set writes workspace.json in the directory it was given and returns { ok: true }", () => {
    const handlers = createGlobalNoiseWordsHandlers({
      userDataDir: dir,
      log,
      isTrustedSender,
    });
    expect(handlers.set(trusted, ["said"])).toEqual({ ok: true });
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
      isTrustedSender,
    });
    const result = handlers.set(trusted, ["said"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message.length).toBeGreaterThan(0);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      `Failed to save the global noise-word list: ${result.message}`,
    );
  });

  it("uses exactly the directory it is given: nothing is written to the working directory (FR-8, FR-9)", () => {
    // Pins the handler-level fix: the handlers use the directory they are
    // given. The model's mkdir('') failure is unchanged (FR-10).
    const emptyCwd = path.join(dir, "empty-cwd");
    const userData = path.join(dir, "user-data");
    fs.mkdirSync(emptyCwd);
    fs.mkdirSync(userData);
    const originalCwd = process.cwd();
    process.chdir(emptyCwd);
    try {
      expect(process.cwd()).toBe(fs.realpathSync(emptyCwd));
      const handlers = createGlobalNoiseWordsHandlers({
        userDataDir: userData,
        log,
        isTrustedSender,
      });
      expect(handlers.set(trusted, ["said"])).toEqual({ ok: true });
      expect(handlers.get(trusted)).toEqual(["said"]);
      expect(fs.readdirSync(emptyCwd)).toEqual([]);
      expect(fs.existsSync(path.join(userData, "workspace.json"))).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("refuses an untrusted sender for get and set, and writes nothing (note_56d253e9)", () => {
    const handlers = createGlobalNoiseWordsHandlers({
      userDataDir: dir,
      log,
      isTrustedSender,
    });
    for (const event of [
      { senderFrame: { url: "http://127.0.0.1:8799/" } },
      { senderFrame: { url: "file:///tmp/x.html" } },
      { senderFrame: null },
      {},
    ]) {
      expect(() => handlers.get(event)).toThrow("Refused: untrusted sender");
      expect(() => handlers.set(event, ["said"])).toThrow(
        "Refused: untrusted sender",
      );
    }
    expect(fs.existsSync(path.join(dir, "workspace.json"))).toBe(false);
  });

  it("refuses a payload that is not an array of strings, and leaves workspace.json as it was", () => {
    fs.writeFileSync(
      path.join(dir, "workspace.json"),
      JSON.stringify({ globalNoiseWords: ["kept"] }),
    );
    const handlers = createGlobalNoiseWordsHandlers({
      userDataDir: dir,
      log,
      isTrustedSender,
    });
    for (const payload of [
      undefined,
      null,
      "said",
      { 0: "said" },
      ["said", 3],
      [["said"]],
    ]) {
      const result = handlers.set(trusted, payload);
      expect(result.ok).toBe(false);
    }
    expect(handlers.get(trusted)).toEqual(["kept"]);
  });
});
