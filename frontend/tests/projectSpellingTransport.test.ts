/**
 * Spell-checker Task 24: lib/api/project-spelling.ts HTTP transport.
 * Every method rejects on a network error, a non-2xx status and a malformed
 * body; a failed read never resolves to empty lists.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addSpellingWord,
  getSpellingLists,
  ignoreSpellingWord,
  removeSpellingWord,
  unignoreSpellingWord,
} from "../src/lib/api/project-spelling";
import { reportTransportValidationFailure } from "../src/lib/api/transport-validation";

vi.mock("../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const GOOD = { spellingProjectWords: ["Zorblax"], spellingIgnoredWords: ["x"] };

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

type Call = { name: string; run: () => Promise<unknown> };

const CALLS: Call[] = [
  { name: "getSpellingLists", run: () => getSpellingLists("p") },
  { name: "addSpellingWord", run: () => addSpellingWord("p", "w") },
  { name: "removeSpellingWord", run: () => removeSpellingWord("p", "w") },
  { name: "ignoreSpellingWord", run: () => ignoreSpellingWord("p", "w") },
  { name: "unignoreSpellingWord", run: () => unignoreSpellingWord("p", "w") },
];

describe.each(CALLS)("$name failure contract", ({ run }) => {
  it("rejects on a network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    await expect(run()).rejects.toThrow("offline");
  });

  it("rejects on a non-2xx status with the server's message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "bad word" }),
    } as Response);
    await expect(run()).rejects.toThrow("bad word");
  });

  it("rejects on a non-2xx status with an unparseable body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);
    await expect(run()).rejects.toThrow(/HTTP 500/);
  });

  it("rejects on a malformed body and reports it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      ok({ spellingProjectWords: "nope" }),
    );
    await expect(run()).rejects.toThrow(/malformed/);
    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
  });
});

describe("getSpellingLists", () => {
  it("GETs with projectId and returns both lists", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok(GOOD));
    await expect(getSpellingLists("p")).resolves.toEqual(GOOD);
    expect(spy.mock.calls[0][0]).toBe("/api/project/spelling?projectId=p");
  });

  it("does not resolve to empty lists when the body omits a list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      ok({ spellingProjectWords: [] }),
    );
    await expect(getSpellingLists("p")).rejects.toThrow(/malformed/);
  });
});

describe("mutations", () => {
  it.each([
    ["add-word", addSpellingWord],
    ["remove-word", removeSpellingWord],
    ["ignore-word", ignoreSpellingWord],
    ["unignore-word", unignoreSpellingWord],
  ] as const)(
    "POSTs %s and returns the resulting lists",
    async (action, fn) => {
      const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok(GOOD));
      await expect(fn("p", "Zorblax")).resolves.toEqual(GOOD);
      const [url, init] = spy.mock.calls[0];
      expect(url).toBe("/api/project/spelling");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        projectId: "p",
        action,
        word: "Zorblax",
      });
    },
  );
});
