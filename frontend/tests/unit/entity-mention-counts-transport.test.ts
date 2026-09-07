// entity-roster Task 3: proves `getEntityMentionCounts` is wired through
// `createTransport` and resolves to the HTTP transport in a web/desktop
// runtime, hitting the Task 2 route with the expected degrade-gracefully
// behavior — mirrors `tests/unit/entity-alias-table-transport.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getEntityMentionCounts,
  httpEntityMentionCountsTransport,
} from "../../src/lib/api/entity-mention-counts";

const RUNTIME_ENV = "NEXT_PUBLIC_GETWRITE_RUNTIME";
const originalRuntime = process.env[RUNTIME_ENV];

afterEach(() => {
  if (originalRuntime === undefined) delete process.env[RUNTIME_ENV];
  else process.env[RUNTIME_ENV] = originalRuntime;
  vi.restoreAllMocks();
});

describe("entity mention counts transport — web runtime", () => {
  beforeEach(() => {
    delete process.env[RUNTIME_ENV];
  });

  it("getEntityMentionCounts calls fetch('/api/project/:id/entity-mention-counts') and returns the parsed counts", async () => {
    const counts = { "entity-1": 3, "entity-2": 1 };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, json: async () => counts } as Response);

    const result = await getEntityMentionCounts("project-1");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/project/project-1/entity-mention-counts",
    );
    expect(result).toEqual(counts);
  });

  it("getEntityMentionCounts resolves to {} on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ "entity-1": 3 }),
    } as Response);

    await expect(getEntityMentionCounts("project-1")).resolves.toEqual({});
  });

  it("getEntityMentionCounts resolves to {} rather than throwing on a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(getEntityMentionCounts("project-1")).resolves.toEqual({});
  });

  it("getEntityMentionCounts resolves to {} on a malformed body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error("invalid json");
      },
    } as unknown as Response);

    await expect(getEntityMentionCounts("project-1")).resolves.toEqual({});
  });
});

describe("httpEntityMentionCountsTransport", () => {
  it("is the transport object used directly by the resolver in web runtime", () => {
    expect(typeof httpEntityMentionCountsTransport.getEntityMentionCounts).toBe(
      "function",
    );
  });
});
