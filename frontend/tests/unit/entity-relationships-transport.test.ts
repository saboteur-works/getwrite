// entity-relationships Task 4: proves `list`/`create`/`remove` are wired
// through `createTransport` and resolve to the HTTP transport in a
// web/desktop runtime, hitting Task 3's routes with the expected
// degrade-gracefully behavior — mirrors
// `tests/unit/entity-cooccurrence-transport.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEntityRelationship,
  httpEntityRelationshipsTransport,
  listEntityRelationships,
  listEntityRelationshipsOrThrow,
  removeEntityRelationship,
  removeEntityRelationshipsForEntity,
} from "../../src/lib/api/entity-relationships";
import type { EntityRelationshipEdge } from "../../src/lib/models/entity-relationships";

const RUNTIME_ENV = "NEXT_PUBLIC_GETWRITE_RUNTIME";
const originalRuntime = process.env[RUNTIME_ENV];

const SAMPLE_EDGE: EntityRelationshipEdge = {
  id: "edge-1",
  sourceEntityId: "entity-1",
  targetEntityId: "entity-2",
  relationshipType: "ally of",
  createdAt: "2026-01-01T00:00:00.000Z",
};

afterEach(() => {
  if (originalRuntime === undefined) delete process.env[RUNTIME_ENV];
  else process.env[RUNTIME_ENV] = originalRuntime;
  vi.restoreAllMocks();
});

describe("entity relationships transport — web runtime — list", () => {
  beforeEach(() => {
    delete process.env[RUNTIME_ENV];
  });

  it("calls fetch('/api/project/:id/entity-relationships') and returns the parsed array on 200", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => [SAMPLE_EDGE],
      } as Response);

    const result = await listEntityRelationships("project-1");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/project/project-1/entity-relationships",
    );
    expect(result).toEqual([SAMPLE_EDGE]);
  });

  it("resolves to [] on a non-2xx response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => [SAMPLE_EDGE],
    } as Response);

    await expect(listEntityRelationships("project-1")).resolves.toEqual([]);
  });

  it("resolves to [] rather than throwing on a network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(listEntityRelationships("project-1")).resolves.toEqual([]);
  });

  it("resolves to [] on a malformed (non-array) body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ not: "an array" }),
    } as Response);

    await expect(listEntityRelationships("project-1")).resolves.toEqual([]);
  });
});

describe("entity relationships transport — web runtime — listOrThrow (FR-26)", () => {
  beforeEach(() => {
    delete process.env[RUNTIME_ENV];
  });

  it("calls fetch('/api/project/:id/entity-relationships') and returns the parsed array on 200", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => [SAMPLE_EDGE],
      } as Response);

    const result = await listEntityRelationshipsOrThrow("project-1");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/project/project-1/entity-relationships",
    );
    expect(result).toEqual([SAMPLE_EDGE]);
  });

  it("REJECTS rather than resolving to [] on a non-2xx response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => [SAMPLE_EDGE],
    } as Response);

    await expect(listEntityRelationshipsOrThrow("project-1")).rejects.toThrow();
  });

  it("REJECTS rather than resolving to [] on a network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(listEntityRelationshipsOrThrow("project-1")).rejects.toThrow(
      "network down",
    );
  });

  it("REJECTS rather than resolving to [] on a malformed (non-array) body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ not: "an array" }),
    } as Response);

    await expect(listEntityRelationshipsOrThrow("project-1")).rejects.toThrow();
  });

  it("does not change list()'s own degrade-to-[] behavior", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(listEntityRelationships("project-1")).resolves.toEqual([]);
  });
});

describe("entity relationships transport — web runtime — create", () => {
  beforeEach(() => {
    delete process.env[RUNTIME_ENV];
  });

  it("posts the triple and returns the created edge on success", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => SAMPLE_EDGE,
      } as Response);

    const result = await createEntityRelationship(
      "project-1",
      "entity-1",
      "entity-2",
      "ally of",
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/project/project-1/entity-relationships",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          sourceEntityId: "entity-1",
          targetEntityId: "entity-2",
          relationshipType: "ally of",
        }),
      }),
    );
    expect(result).toEqual(SAMPLE_EDGE);
  });

  it("resolves null rather than throwing on a non-2xx response (e.g. FR-4/FR-15 rejection)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ error: "same entity" }),
    } as Response);

    await expect(
      createEntityRelationship("project-1", "entity-1", "entity-1", "ally of"),
    ).resolves.toBeNull();
  });

  it("resolves null rather than throwing on a network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(
      createEntityRelationship("project-1", "entity-1", "entity-2", "ally of"),
    ).resolves.toBeNull();
  });
});

describe("entity relationships transport — web runtime — remove", () => {
  beforeEach(() => {
    delete process.env[RUNTIME_ENV];
  });

  it("returns true when the route reports the edge was removed", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({ removed: true }),
      } as Response);

    const didRemove = await removeEntityRelationship("project-1", "edge-1");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/project/project-1/entity-relationships/remove",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ edgeId: "edge-1" }),
      }),
    );
    expect(didRemove).toBe(true);
  });

  it("returns false when the route reports the edge was not found", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ removed: false }),
    } as Response);

    await expect(
      removeEntityRelationship("project-1", "missing-edge"),
    ).resolves.toBe(false);
  });

  it("returns false on a non-2xx response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);

    await expect(removeEntityRelationship("project-1", "edge-1")).resolves.toBe(
      false,
    );
  });

  it("returns false rather than throwing on a network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(removeEntityRelationship("project-1", "edge-1")).resolves.toBe(
      false,
    );
  });
});

describe("entity relationships transport — web runtime — removeByEntity", () => {
  beforeEach(() => {
    delete process.env[RUNTIME_ENV];
  });

  it("posts the entityId and returns the parsed removedCount on success", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({ removedCount: 3 }),
      } as Response);

    const removedCount = await removeEntityRelationshipsForEntity(
      "project-1",
      "entity-1",
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/project/project-1/entity-relationships/remove-by-entity",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ entityId: "entity-1" }),
      }),
    );
    expect(removedCount).toBe(3);
  });

  it("resolves to 0 on a non-2xx response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ removedCount: 3 }),
    } as Response);

    await expect(
      removeEntityRelationshipsForEntity("project-1", "entity-1"),
    ).resolves.toBe(0);
  });

  it("resolves to 0 rather than throwing on a network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(
      removeEntityRelationshipsForEntity("project-1", "entity-1"),
    ).resolves.toBe(0);
  });

  it("resolves to 0 on a malformed (non-numeric removedCount) body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ not: "a removedCount" }),
    } as Response);

    await expect(
      removeEntityRelationshipsForEntity("project-1", "entity-1"),
    ).resolves.toBe(0);
  });
});

describe("httpEntityRelationshipsTransport", () => {
  it("is the transport object used directly by the resolver in web runtime", () => {
    expect(typeof httpEntityRelationshipsTransport.list).toBe("function");
    expect(typeof httpEntityRelationshipsTransport.listOrThrow).toBe(
      "function",
    );
    expect(typeof httpEntityRelationshipsTransport.create).toBe("function");
    expect(typeof httpEntityRelationshipsTransport.remove).toBe("function");
    expect(typeof httpEntityRelationshipsTransport.removeByEntity).toBe(
      "function",
    );
  });
});
