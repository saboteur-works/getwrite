import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchSplitResourceContent,
  fetchSplitRevisionContent,
} from "../../src/lib/api/split-stored-read";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/crypto/locked-errors";

function respond(
  status: number,
  body: unknown = {},
  headers: Record<string, string> = {},
): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("split stored-text reads", () => {
  it("rethrows a 401 as the project-locked error on both reads", async () => {
    respond(401);
    await expect(fetchSplitResourceContent("p", "r")).rejects.toBeInstanceOf(
      ProjectLockedError,
    );
    await expect(
      fetchSplitRevisionContent("r", "p", "v"),
    ).rejects.toBeInstanceOf(ProjectLockedError);
  });

  it("rethrows a 409 as the missing-key error", async () => {
    respond(409);
    await expect(fetchSplitResourceContent("p", "r")).rejects.toBeInstanceOf(
      MissingProjectKeyError,
    );
  });

  it("leaves a not-paired 401 as an unreadable (null) result", async () => {
    respond(401, {}, { "x-getwrite-gate": "not-paired" });
    expect(await fetchSplitResourceContent("p", "r")).toBeNull();
  });

  it("resolves null for another failure or a thrown fetch", async () => {
    respond(500);
    expect(await fetchSplitRevisionContent("r", "p", "v")).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      }),
    );
    expect(await fetchSplitResourceContent("p", "r")).toBeNull();
  });

  it("returns the revision list and the revision text on success", async () => {
    respond(200, { revisions: [{ id: "a", isCanonical: true }] });
    expect(await fetchSplitResourceContent("p", "r")).toEqual({
      revisions: [{ id: "a", isCanonical: true }],
    });
    respond(200, { content: "text" });
    expect(await fetchSplitRevisionContent("r", "p", "v")).toBe("text");
  });
});
