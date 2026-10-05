/**
 * Entity Mention Noise Flagging, Task 11: lib/api/global-noise-words.ts
 * (the three-way web/Electron/native-Android transport collapse) and its
 * native backend. Mirrors entity-graph-settings-transport.test.ts's
 * structure, plus explicit coverage of the Electron-vs-web branch inside
 * the "http" implementation and of FR-15's no-sync/no-merge guarantee.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getGlobalNoiseWords,
  httpGlobalNoiseWordsTransport,
  setGlobalNoiseWords,
} from "../../src/lib/api/global-noise-words";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";
import * as desktopBridge from "../../src/lib/desktop-bridge";
import { createNativeGlobalNoiseWordsTransport } from "../../src/store/transport/native-global-noise-words-backend";
import * as nativeGlobalNoiseWords from "../../src/lib/models/native-global-noise-words";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("getGlobalNoiseWords — web (no desktop bridge)", () => {
  it("GETs /api/global-noise-words and returns the bare array", async () => {
    vi.spyOn(desktopBridge, "getDesktopBridge").mockReturnValue(null);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ["red herring", "macguffin"],
      } as Response);

    await expect(getGlobalNoiseWords()).resolves.toEqual([
      "red herring",
      "macguffin",
    ]);
    expect(fetchSpy).toHaveBeenCalledWith("/api/global-noise-words");
  });

  it("rejects on a non-2xx response with the server's message", async () => {
    vi.spyOn(desktopBridge, "getDesktopBridge").mockReturnValue(null);
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "nope" }),
    } as Response);

    await expect(getGlobalNoiseWords()).rejects.toThrow("nope");
  });

  it("rejects on a network failure", async () => {
    vi.spyOn(desktopBridge, "getDesktopBridge").mockReturnValue(null);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(getGlobalNoiseWords()).rejects.toThrow();
  });

  it("reports and rejects on a malformed body", async () => {
    vi.spyOn(desktopBridge, "getDesktopBridge").mockReturnValue(null);
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ not: "an array" }),
    } as Response);

    await expect(getGlobalNoiseWords()).rejects.toThrow();
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "global-noise-words.getGlobalNoiseWords",
      expect.any(Array),
    );
  });
});

describe("setGlobalNoiseWords — web (no desktop bridge)", () => {
  it("PUTs the bare array and returns the persisted list", async () => {
    vi.spyOn(desktopBridge, "getDesktopBridge").mockReturnValue(null);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ["red herring"],
      } as Response);

    await expect(setGlobalNoiseWords(["red herring"])).resolves.toEqual([
      "red herring",
    ]);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/global-noise-words");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual(["red herring"]);
  });

  it("rejects on a non-2xx response with the server's message", async () => {
    vi.spyOn(desktopBridge, "getDesktopBridge").mockReturnValue(null);
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Invalid list" }),
    } as Response);

    await expect(setGlobalNoiseWords(["x"])).rejects.toThrow("Invalid list");
  });

  it("reports and rejects on a malformed body", async () => {
    vi.spyOn(desktopBridge, "getDesktopBridge").mockReturnValue(null);
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ not: "an array" }),
    } as Response);

    await expect(setGlobalNoiseWords(["x"])).rejects.toThrow();
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "global-noise-words.setGlobalNoiseWords",
      expect.any(Array),
    );
  });
});

describe("Electron path (desktop bridge present)", () => {
  it("getGlobalNoiseWords calls the bridge, not fetch", async () => {
    const bridgeGet = vi.fn().mockResolvedValue(["bridge-word"]);
    vi.spyOn(desktopBridge, "getDesktopBridge").mockReturnValue({
      getGlobalNoiseWords: bridgeGet,
      setGlobalNoiseWords: vi.fn(),
    } as unknown as desktopBridge.DesktopBridge);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(getGlobalNoiseWords()).resolves.toEqual(["bridge-word"]);
    expect(bridgeGet).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("setGlobalNoiseWords calls the bridge and returns the words on success, not fetch", async () => {
    const bridgeSet = vi.fn().mockResolvedValue({ ok: true });
    vi.spyOn(desktopBridge, "getDesktopBridge").mockReturnValue({
      getGlobalNoiseWords: vi.fn(),
      setGlobalNoiseWords: bridgeSet,
    } as unknown as desktopBridge.DesktopBridge);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(setGlobalNoiseWords(["a", "b"])).resolves.toEqual(["a", "b"]);
    expect(bridgeSet).toHaveBeenCalledWith(["a", "b"]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("setGlobalNoiseWords rejects with the bridge's message on failure", async () => {
    const bridgeSet = vi
      .fn()
      .mockResolvedValue({ ok: false, message: "disk full" });
    vi.spyOn(desktopBridge, "getDesktopBridge").mockReturnValue({
      getGlobalNoiseWords: vi.fn(),
      setGlobalNoiseWords: bridgeSet,
    } as unknown as desktopBridge.DesktopBridge);

    await expect(setGlobalNoiseWords(["a"])).rejects.toThrow("disk full");
  });

  it("exposes the http transport object", () => {
    expect(typeof httpGlobalNoiseWordsTransport.getGlobalNoiseWords).toBe(
      "function",
    );
    expect(typeof httpGlobalNoiseWordsTransport.setGlobalNoiseWords).toBe(
      "function",
    );
  });
});

describe("native backend (true native Android, no desktop bridge)", () => {
  it("getGlobalNoiseWords delegates directly to getNativeGlobalNoiseWords", async () => {
    const coreSpy = vi
      .spyOn(nativeGlobalNoiseWords, "getNativeGlobalNoiseWords")
      .mockResolvedValue(["native-word"]);

    const native = createNativeGlobalNoiseWordsTransport();
    await expect(native.getGlobalNoiseWords()).resolves.toEqual([
      "native-word",
    ]);
    expect(coreSpy).toHaveBeenCalledTimes(1);
  });

  it("setGlobalNoiseWords delegates to setNativeGlobalNoiseWords and returns the words", async () => {
    const coreSpy = vi
      .spyOn(nativeGlobalNoiseWords, "setNativeGlobalNoiseWords")
      .mockResolvedValue(undefined);

    const native = createNativeGlobalNoiseWordsTransport();
    await expect(native.setGlobalNoiseWords(["a", "b"])).resolves.toEqual([
      "a",
      "b",
    ]);
    expect(coreSpy).toHaveBeenCalledWith(["a", "b"]);
  });

  it("propagates (does not swallow) a rejection from the native store", async () => {
    const error = new Error("boom");
    vi.spyOn(
      nativeGlobalNoiseWords,
      "getNativeGlobalNoiseWords",
    ).mockRejectedValue(error);

    const native = createNativeGlobalNoiseWordsTransport();
    await expect(native.getGlobalNoiseWords()).rejects.toThrow("boom");
  });
});

describe("FR-15: no sync/merge between the three runtime-specific stores", () => {
  it("setting the list via the Electron bridge never touches fetch or the native store", async () => {
    const bridgeSet = vi.fn().mockResolvedValue({ ok: true });
    vi.spyOn(desktopBridge, "getDesktopBridge").mockReturnValue({
      getGlobalNoiseWords: vi.fn(),
      setGlobalNoiseWords: bridgeSet,
    } as unknown as desktopBridge.DesktopBridge);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const nativeSetSpy = vi.spyOn(
      nativeGlobalNoiseWords,
      "setNativeGlobalNoiseWords",
    );

    await setGlobalNoiseWords(["electron-only"]);

    expect(bridgeSet).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(nativeSetSpy).not.toHaveBeenCalled();
  });

  it("setting the list via the native backend never touches fetch or the Electron bridge", async () => {
    const bridgeGet = vi.fn();
    vi.spyOn(desktopBridge, "getDesktopBridge").mockReturnValue(null);
    vi.spyOn(
      nativeGlobalNoiseWords,
      "setNativeGlobalNoiseWords",
    ).mockResolvedValue(undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const native = createNativeGlobalNoiseWordsTransport();
    await native.setGlobalNoiseWords(["native-only"]);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(bridgeGet).not.toHaveBeenCalled();
  });
});
