// entity-cooccurrence Task 3: proves `getEntityCooccurrence` is wired
// through `createTransport` and resolves to the HTTP transport in a
// web/desktop runtime, hitting the Task 2 route with the expected
// degrade-gracefully behavior — mirrors
// `tests/unit/entity-mention-counts-transport.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getEntityCooccurrence,
  httpEntityCooccurrenceTransport,
} from "../../src/lib/api/entity-cooccurrence";
import type { EntityCooccurrenceEntry } from "../../src/lib/models/mentions-core";

const RUNTIME_ENV = "NEXT_PUBLIC_GETWRITE_RUNTIME";
const originalRuntime = process.env[RUNTIME_ENV];

afterEach(() => {
  if (originalRuntime === undefined) delete process.env[RUNTIME_ENV];
  else process.env[RUNTIME_ENV] = originalRuntime;
  vi.restoreAllMocks();
});

describe("entity cooccurrence transport — web runtime", () => {
  beforeEach(() => {
    delete process.env[RUNTIME_ENV];
  });

  it("getEntityCooccurrence calls fetch('/api/project/:id/entity-cooccurrence') and returns the parsed map", async () => {
    const cooccurrence: Record<string, EntityCooccurrenceEntry[]> = {
      "entity-1": [{ entityId: "entity-2", count: 2, resourceIds: ["r-1"] }],
      "entity-2": [{ entityId: "entity-1", count: 2, resourceIds: ["r-1"] }],
    };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => cooccurrence,
      } as Response);

    const result = await getEntityCooccurrence("project-1");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/project/project-1/entity-cooccurrence",
    );
    expect(result).toEqual(cooccurrence);
  });

  it("getEntityCooccurrence resolves to {} on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ "entity-1": [] }),
    } as Response);

    await expect(getEntityCooccurrence("project-1")).resolves.toEqual({});
  });

  it("getEntityCooccurrence resolves to {} rather than throwing on a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(getEntityCooccurrence("project-1")).resolves.toEqual({});
  });

  it("getEntityCooccurrence resolves to {} on a malformed body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error("invalid json");
      },
    } as unknown as Response);

    await expect(getEntityCooccurrence("project-1")).resolves.toEqual({});
  });
});

describe("httpEntityCooccurrenceTransport", () => {
  it("is the transport object used directly by the resolver in web runtime", () => {
    expect(typeof httpEntityCooccurrenceTransport.getEntityCooccurrence).toBe(
      "function",
    );
  });
});
