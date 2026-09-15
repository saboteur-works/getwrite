// trash-ui Task 12: proves `listTrash`/`restoreTrashItems`/`purgeTrashItems`
// are wired through `createTransport`, hit Task 11's routes with the
// expected request shape in a web/desktop runtime, and REJECT (rather than
// degrade) on any transport failure — mirrors
// `tests/unit/entity-relationships-transport.test.ts`'s structure, adapted
// to this module's all-throw contract (see `lib/api/trash.ts`'s doc
// comment for why).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  httpTrashTransport,
  listTrash,
  purgeTrashItems,
  restoreTrashItems,
  type PurgeItemResult,
  type RestoreItemResult,
  type TrashListing,
} from "../../src/lib/api/trash";

const RUNTIME_ENV = "NEXT_PUBLIC_GETWRITE_RUNTIME";
const originalRuntime = process.env[RUNTIME_ENV];

const SAMPLE_LISTING: TrashListing = {
  resources: [
    {
      id: "resource-1",
      originalName: "Chapter One",
      resourceType: "text",
      originalParentId: null,
      deletedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  folders: [
    {
      id: "folder-1",
      originalName: "Notes",
      originalParentId: null,
      deletedAt: "2026-01-01T00:00:00.000Z",
      descendants: [],
    },
  ],
};

afterEach(() => {
  if (originalRuntime === undefined) delete process.env[RUNTIME_ENV];
  else process.env[RUNTIME_ENV] = originalRuntime;
  vi.restoreAllMocks();
});

describe("trash transport — web runtime — listTrash", () => {
  beforeEach(() => {
    delete process.env[RUNTIME_ENV];
  });

  it("calls fetch('/api/project/:id/trash') and returns the parsed listing on 200", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => SAMPLE_LISTING,
      } as Response);

    const result = await listTrash("project-1");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith("/api/project/project-1/trash");
    expect(result).toEqual(SAMPLE_LISTING);
  });

  it("REJECTS on a non-2xx response, rather than degrading to an empty listing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => SAMPLE_LISTING,
    } as Response);

    await expect(listTrash("project-1")).rejects.toThrow();
  });

  it("REJECTS on a network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(listTrash("project-1")).rejects.toThrow("network down");
  });

  it("REJECTS on a malformed body (missing resources/folders arrays)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ not: "a listing" }),
    } as Response);

    await expect(listTrash("project-1")).rejects.toThrow();
  });
});

describe("trash transport — web runtime — restoreTrashItems", () => {
  beforeEach(() => {
    delete process.env[RUNTIME_ENV];
  });

  it("posts the ids and returns the parsed per-item results on success", async () => {
    const results: RestoreItemResult[] = [
      { id: "resource-1", ok: true, relocated: false, renamed: false },
    ];
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({ results }),
      } as Response);

    const result = await restoreTrashItems("project-1", ["resource-1"]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/project/project-1/trash/restore",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ids: ["resource-1"] }),
      }),
    );
    expect(result).toEqual(results);
  });

  it("preserves a restoredName field from the response (Task 1, FR-1)", async () => {
    const results: RestoreItemResult[] = [
      {
        id: "resource-1",
        ok: true,
        relocated: false,
        renamed: true,
        restoredName: "Draft (restored 2)",
      },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ results }),
    } as Response);

    const result = await restoreTrashItems("project-1", ["resource-1"]);

    expect(result[0]?.restoredName).toBe("Draft (restored 2)");
  });

  it("REJECTS on a non-2xx response, rather than synthesizing per-item failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ results: [] }),
    } as Response);

    await expect(
      restoreTrashItems("project-1", ["resource-1"]),
    ).rejects.toThrow();
  });

  it("REJECTS on a network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(
      restoreTrashItems("project-1", ["resource-1"]),
    ).rejects.toThrow("network down");
  });

  it("REJECTS on a malformed body (missing results array)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ not: "results" }),
    } as Response);

    await expect(
      restoreTrashItems("project-1", ["resource-1"]),
    ).rejects.toThrow();
  });
});

describe("trash transport — web runtime — purgeTrashItems", () => {
  beforeEach(() => {
    delete process.env[RUNTIME_ENV];
  });

  it("posts explicit ids and returns the parsed per-item results on success", async () => {
    const results: PurgeItemResult[] = [{ id: "resource-1", ok: true }];
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({ results }),
      } as Response);

    const result = await purgeTrashItems("project-1", ["resource-1"]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/project/project-1/trash/purge",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ids: ["resource-1"] }),
      }),
    );
    expect(result).toEqual(results);
  });

  it("posts { all: true } for the 'Empty trash' selection", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      } as Response);

    await purgeTrashItems("project-1", { all: true });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/project/project-1/trash/purge",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ all: true }),
      }),
    );
  });

  it("REJECTS on a non-2xx response, rather than synthesizing per-item failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ results: [] }),
    } as Response);

    await expect(
      purgeTrashItems("project-1", ["resource-1"]),
    ).rejects.toThrow();
  });

  it("REJECTS on a network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(purgeTrashItems("project-1", ["resource-1"])).rejects.toThrow(
      "network down",
    );
  });

  it("REJECTS on a malformed body (missing results array)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ not: "results" }),
    } as Response);

    await expect(
      purgeTrashItems("project-1", ["resource-1"]),
    ).rejects.toThrow();
  });
});

describe("httpTrashTransport", () => {
  it("is the transport object used directly by the resolver in web runtime", () => {
    expect(typeof httpTrashTransport.list).toBe("function");
    expect(typeof httpTrashTransport.restore).toBe("function");
    expect(typeof httpTrashTransport.purge).toBe("function");
  });
});

describe("trash transport — native runtime", () => {
  beforeEach(() => {
    process.env[RUNTIME_ENV] = "native";
  });

  it("resolveTrashTransport resolves to a transport whose methods reject ('not supported on this platform')", async () => {
    const { resolveTrashTransport } = await import("../../src/lib/api/trash");
    const transport = await resolveTrashTransport();

    await expect(transport.list("project-1")).rejects.toThrow(
      /not supported on this platform/,
    );
    await expect(transport.restore("project-1", ["id-1"])).rejects.toThrow(
      /not supported on this platform/,
    );
    await expect(transport.purge("project-1", ["id-1"])).rejects.toThrow(
      /not supported on this platform/,
    );
  });
});
