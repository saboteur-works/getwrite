/**
 * Entity Mention Noise Flagging, Task 6: lib/api/project-noise-words.ts
 * (HTTP-only transport; no native backend for this task), mirroring
 * entity-graph-settings-transport.test.ts's HTTP section.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addCustomNoiseWord,
  excludeGlobalNoiseWord,
  getNoiseWordLists,
  removeCustomNoiseWord,
  unexcludeGlobalNoiseWord,
} from "../../src/lib/api/project-noise-words";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("getNoiseWordLists", () => {
  it("GETs with projectId as a query param and returns both lists", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          customNoiseWords: ["very"],
          excludedGlobalNoiseWords: ["said"],
        }),
      } as Response);

    await expect(getNoiseWordLists("p")).resolves.toEqual({
      customNoiseWords: ["very"],
      excludedGlobalNoiseWords: ["said"],
    });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/project/noise-words?projectId=p");
  });

  it("rejects on a non-2xx response with the server's message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Invalid projectId" }),
    } as Response);

    await expect(getNoiseWordLists("p")).rejects.toThrow("Invalid projectId");
  });

  it("rejects on a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(getNoiseWordLists("p")).rejects.toThrow();
  });

  it("reports and rejects on a malformed body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ customNoiseWords: "x" }),
    } as Response);

    await expect(getNoiseWordLists("p")).rejects.toThrow();
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "project-noise-words.getNoiseWordLists",
      expect.any(Array),
    );
  });
});

describe("addCustomNoiseWord / removeCustomNoiseWord", () => {
  it("POSTs the add-custom action and returns the updated lists", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          customNoiseWords: ["very"],
          excludedGlobalNoiseWords: [],
        }),
      } as Response);

    await expect(addCustomNoiseWord("p", "very")).resolves.toEqual({
      customNoiseWords: ["very"],
      excludedGlobalNoiseWords: [],
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/project/noise-words");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      projectId: "p",
      action: "add-custom",
      word: "very",
    });
  });

  it("POSTs the remove-custom action", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          customNoiseWords: [],
          excludedGlobalNoiseWords: [],
        }),
      } as Response);

    await expect(removeCustomNoiseWord("p", "very")).resolves.toEqual({
      customNoiseWords: [],
      excludedGlobalNoiseWords: [],
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      projectId: "p",
      action: "remove-custom",
      word: "very",
    });
  });

  it("rejects on a non-2xx response with the server's message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Invalid noise word" }),
    } as Response);

    await expect(addCustomNoiseWord("p", "")).rejects.toThrow(
      "Invalid noise word",
    );
  });

  it("reports and rejects on a malformed body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ customNoiseWords: "x" }),
    } as Response);

    await expect(addCustomNoiseWord("p", "very")).rejects.toThrow();
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "project-noise-words.addCustomNoiseWord",
      expect.any(Array),
    );
  });
});

describe("excludeGlobalNoiseWord / unexcludeGlobalNoiseWord", () => {
  it("POSTs the exclude-global action", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          customNoiseWords: [],
          excludedGlobalNoiseWords: ["said"],
        }),
      } as Response);

    await expect(excludeGlobalNoiseWord("p", "said")).resolves.toEqual({
      customNoiseWords: [],
      excludedGlobalNoiseWords: ["said"],
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      projectId: "p",
      action: "exclude-global",
      word: "said",
    });
  });

  it("POSTs the unexclude-global action", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          customNoiseWords: [],
          excludedGlobalNoiseWords: [],
        }),
      } as Response);

    await expect(unexcludeGlobalNoiseWord("p", "said")).resolves.toEqual({
      customNoiseWords: [],
      excludedGlobalNoiseWords: [],
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      projectId: "p",
      action: "unexclude-global",
      word: "said",
    });
  });
});
