/**
 * Feature 96, Task 8: lib/api/user-word-list.ts — the client transport that
 * resolves to the Electron bridge, the /api route or the native backend at
 * call time. A failure must reject; it must never resolve to an empty list.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  UserWordListTransportError,
  addUserWord,
  getUserWords,
  removeUserWord,
} from "../../src/lib/api/user-word-list";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";
import * as desktopBridge from "../../src/lib/desktop-bridge";
import * as nativeUserWordList from "../../src/lib/models/native-user-word-list";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function noBridge(): void {
  vi.spyOn(desktopBridge, "getDesktopBridge").mockReturnValue(null);
}

function mockFetch(status: number, body: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response);
}

describe("web path (no desktop bridge)", () => {
  it("getUserWords GETs the route and returns the bare array", async () => {
    noBridge();
    const fetchSpy = mockFetch(200, ["zorp", "blenk"]);
    await expect(getUserWords()).resolves.toEqual(["zorp", "blenk"]);
    expect(fetchSpy).toHaveBeenCalledWith("/api/user-word-list");
  });

  it("addUserWord POSTs {word} and returns the persisted list", async () => {
    noBridge();
    const fetchSpy = mockFetch(200, ["zorp"]);
    await expect(addUserWord("zorp")).resolves.toEqual(["zorp"]);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/user-word-list");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ word: "zorp" });
  });

  it("removeUserWord DELETEs {word} and returns the persisted list", async () => {
    noBridge();
    const fetchSpy = mockFetch(200, ["blenk"]);
    await expect(removeUserWord("zorp")).resolves.toEqual(["blenk"]);
    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.method).toBe("DELETE");
    expect(JSON.parse(String(init?.body))).toEqual({ word: "zorp" });
  });

  it("a 403 refusal rejects with reason 'refused' and the message", async () => {
    noBridge();
    mockFetch(403, { error: "Not allowed on a paired device.", limit: "x" });
    const error = await getUserWords().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UserWordListTransportError);
    expect((error as UserWordListTransportError).reason).toBe("refused");
    expect((error as Error).message).toBe("Not allowed on a paired device.");
  });

  it("keeps the reason of a 409 list-full body", async () => {
    noBridge();
    mockFetch(409, { error: "List is full.", reason: "list-full" });
    const error = await addUserWord("a").catch((e: unknown) => e);
    expect((error as UserWordListTransportError).reason).toBe("list-full");
    expect((error as Error).message).toBe("List is full.");
  });

  it("keeps the reason of a 500 corrupt body (not an empty list)", async () => {
    noBridge();
    mockFetch(500, { error: "Stored list is corrupt.", reason: "corrupt" });
    const error = await getUserWords().catch((e: unknown) => e);
    expect((error as UserWordListTransportError).reason).toBe("corrupt");
  });

  it("an unparseable error body still rejects with a fallback message", async () => {
    noBridge();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);
    await expect(getUserWords()).rejects.toThrow(/502/);
  });

  it("a network failure rejects", async () => {
    noBridge();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(getUserWords()).rejects.toThrow("offline");
  });

  it.each([
    ["getUserWords", () => getUserWords()],
    ["addUserWord", () => addUserWord("a")],
    ["removeUserWord", () => removeUserWord("a")],
  ])("%s reports and rejects on a malformed body", async (name, call) => {
    noBridge();
    mockFetch(200, { not: "an array" });
    await expect(call()).rejects.toThrow();
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      `user-word-list.${name}`,
      expect.any(Array),
    );
  });
});

describe("Electron path (desktop bridge present)", () => {
  function withBridge(overrides: Record<string, unknown>): void {
    vi.spyOn(desktopBridge, "getDesktopBridge").mockReturnValue({
      getUserWordList: vi.fn(),
      addUserWord: vi.fn(),
      removeUserWord: vi.fn(),
      ...overrides,
    } as unknown as desktopBridge.DesktopBridge);
  }

  it("uses the bridge for all three calls, not fetch", async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, words: ["a"] });
    const add = vi.fn().mockResolvedValue({ ok: true, words: ["a", "b"] });
    const remove = vi.fn().mockResolvedValue({ ok: true, words: ["b"] });
    withBridge({
      getUserWordList: get,
      addUserWord: add,
      removeUserWord: remove,
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(getUserWords()).resolves.toEqual(["a"]);
    await expect(addUserWord("b")).resolves.toEqual(["a", "b"]);
    await expect(removeUserWord("a")).resolves.toEqual(["b"]);
    expect(add).toHaveBeenCalledWith("b");
    expect(remove).toHaveBeenCalledWith("a");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps ok:false to a rejection carrying the reason", async () => {
    withBridge({
      getUserWordList: vi
        .fn()
        .mockResolvedValue({
          ok: false,
          reason: "unreadable",
          message: "Cannot read the list.",
        }),
    });
    const error = await getUserWords().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UserWordListTransportError);
    expect((error as UserWordListTransportError).reason).toBe("unreadable");
    expect((error as Error).message).toBe("Cannot read the list.");
  });

  it("propagates a bridge call that itself rejects", async () => {
    withBridge({ addUserWord: vi.fn().mockRejectedValue(new Error("ipc")) });
    await expect(addUserWord("a")).rejects.toThrow("ipc");
  });

  it("validates the bridge payload", async () => {
    withBridge({
      getUserWordList: vi.fn().mockResolvedValue({ ok: true, words: [1] }),
    });
    await expect(getUserWords()).rejects.toThrow();
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "user-word-list.getUserWords",
      expect.any(Array),
    );
  });

  it("checks the bridge per call, not at import", async () => {
    noBridge();
    mockFetch(200, ["w"]);
    await expect(getUserWords()).resolves.toEqual(["w"]);
    withBridge({
      getUserWordList: vi.fn().mockResolvedValue({ ok: true, words: ["x"] }),
    });
    await expect(getUserWords()).resolves.toEqual(["x"]);
  });
});

describe("native runtime (createTransport selects the native backend)", () => {
  it("routes all three calls to the native store, not fetch or the bridge", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    const bridgeSpy = vi.spyOn(desktopBridge, "getDesktopBridge");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    vi.spyOn(nativeUserWordList, "getNativeUserWords").mockResolvedValue(["n"]);
    vi.spyOn(nativeUserWordList, "addNativeUserWord").mockResolvedValue([
      "n",
      "m",
    ]);
    vi.spyOn(nativeUserWordList, "removeNativeUserWord").mockResolvedValue([
      "m",
    ]);

    await expect(getUserWords()).resolves.toEqual(["n"]);
    await expect(addUserWord("m")).resolves.toEqual(["n", "m"]);
    await expect(removeUserWord("n")).resolves.toEqual(["m"]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(bridgeSpy).not.toHaveBeenCalled();
  });

  it("propagates a native store rejection", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    vi.spyOn(nativeUserWordList, "getNativeUserWords").mockRejectedValue(
      new Error("boom"),
    );
    await expect(getUserWords()).rejects.toThrow("boom");
  });
});
