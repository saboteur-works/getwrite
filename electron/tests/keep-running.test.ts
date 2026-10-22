/**
 * Keeping GetWrite running after its window closes: the close decision, the
 * `workspace.json` setting, and its IPC handlers.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  createKeepRunningHandlers,
  shouldQuitWhenAllWindowsClosed,
} from "../src/keep-running";
import {
  readKeepRunningWhenWindowClosed,
  writeKeepRunningWhenWindowClosed,
} from "../src/projects-dir";

let dir: string;

const LOCAL = "http://localhost:7340";
const trusted = { senderFrame: { url: `${LOCAL}/` } };
const untrusted = { senderFrame: { url: "http://evil.example/" } };
const isTrustedSender = (url: string | null | undefined): boolean =>
  typeof url === "string" && url.startsWith(`${LOCAL}/`);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-keep-running-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("shouldQuitWhenAllWindowsClosed", () => {
  it("quits on macOS when the setting is off", () => {
    expect(shouldQuitWhenAllWindowsClosed("darwin", false)).toBe(true);
  });

  it("keeps running on macOS when the setting is on", () => {
    expect(shouldQuitWhenAllWindowsClosed("darwin", true)).toBe(false);
  });

  it("quits on Windows and Linux whatever the setting says", () => {
    expect(shouldQuitWhenAllWindowsClosed("win32", true)).toBe(true);
    expect(shouldQuitWhenAllWindowsClosed("linux", true)).toBe(true);
  });
});

describe("the keep-running setting in workspace.json", () => {
  it("reads as off when nothing is recorded", () => {
    expect(readKeepRunningWhenWindowClosed(dir)).toBe(false);
  });

  it("reads as off for a non-boolean value or a corrupt file", () => {
    fs.writeFileSync(
      path.join(dir, "workspace.json"),
      JSON.stringify({ keepRunningWhenWindowClosed: "yes" }),
    );
    expect(readKeepRunningWhenWindowClosed(dir)).toBe(false);
    fs.writeFileSync(path.join(dir, "workspace.json"), "{not json");
    expect(readKeepRunningWhenWindowClosed(dir)).toBe(false);
  });

  it("records the setting and keeps the file's other fields", () => {
    fs.writeFileSync(
      path.join(dir, "workspace.json"),
      JSON.stringify({ sharingEnabled: true, globalNoiseWords: ["said"] }),
    );

    writeKeepRunningWhenWindowClosed(dir, true);

    expect(readKeepRunningWhenWindowClosed(dir)).toBe(true);
    expect(
      JSON.parse(fs.readFileSync(path.join(dir, "workspace.json"), "utf8")),
    ).toEqual({
      sharingEnabled: true,
      globalNoiseWords: ["said"],
      keepRunningWhenWindowClosed: true,
    });
  });
});

describe("createKeepRunningHandlers", () => {
  it("get reports the setting and that macOS supports it", () => {
    writeKeepRunningWhenWindowClosed(dir, true);
    const handlers = createKeepRunningHandlers({
      userDataDir: dir,
      platform: "darwin",
      isTrustedSender,
    });

    expect(handlers.get(trusted)).toEqual({ supported: true, enabled: true });
  });

  it("get reports Windows and Linux as unsupported", () => {
    const handlers = createKeepRunningHandlers({
      userDataDir: dir,
      platform: "win32",
      isTrustedSender,
    });

    expect(handlers.get(trusted)).toEqual({ supported: false, enabled: false });
  });

  it("set records a boolean", () => {
    const handlers = createKeepRunningHandlers({
      userDataDir: dir,
      platform: "darwin",
      isTrustedSender,
    });

    handlers.set(trusted, true);

    expect(readKeepRunningWhenWindowClosed(dir)).toBe(true);
  });

  it("set refuses a non-boolean without writing", () => {
    const handlers = createKeepRunningHandlers({
      userDataDir: dir,
      platform: "darwin",
      isTrustedSender,
    });

    expect(() => handlers.set(trusted, "true")).toThrow(
      "Keep-running setting must be true or false",
    );
    expect(fs.existsSync(path.join(dir, "workspace.json"))).toBe(false);
  });

  it("refuses an untrusted sender before reading or writing", () => {
    const handlers = createKeepRunningHandlers({
      userDataDir: dir,
      platform: "darwin",
      isTrustedSender,
    });

    expect(() => handlers.get(untrusted)).toThrow("untrusted sender");
    expect(() => handlers.set(untrusted, true)).toThrow("untrusted sender");
    expect(fs.existsSync(path.join(dir, "workspace.json"))).toBe(false);
  });
});
