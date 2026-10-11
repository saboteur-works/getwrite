/**
 * Feature 77 (Task 16): the server's 403 `{ error, limit }` refusal reaches
 * the caller from the project-delete and revision-delete transports, as a
 * `LimitRefusalError` carrying the server's message and the `limit` key. Any
 * other failure keeps its present behaviour. The encryption and Trash purge
 * transports have the same cases in their own test files.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LimitRefusalError,
  isLimitRefusalError,
  limitRefusalFromResponse,
} from "../../src/lib/api/limit-refusal";
import { httpProjectActionsTransport } from "../../src/store/project-actions-controller";
import { removeRevision } from "../../src/store/revision-transport-service";

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const REFUSAL = { error: "Do it at the desktop.", limit: "projectDeletion" };

describe("limitRefusalFromResponse", () => {
  it("returns a LimitRefusalError for a 403 with error and a known limit", () => {
    const result = limitRefusalFromResponse(403, REFUSAL);
    expect(result).toBeInstanceOf(LimitRefusalError);
    expect(result?.message).toBe("Do it at the desktop.");
    expect(result?.limit).toBe("projectDeletion");
  });

  it.each([
    [401, REFUSAL],
    [409, REFUSAL],
    [500, REFUSAL],
    [403, { error: "Forbidden" }],
    [403, { error: "x", limit: "notAKey" }],
    [403, { limit: "locking" }],
    [403, null],
    [403, "text"],
  ])("returns null for status %s body %j", (status, body) => {
    expect(limitRefusalFromResponse(status, body)).toBeNull();
  });

  it("isLimitRefusalError recognises only the class", () => {
    expect(isLimitRefusalError(new LimitRefusalError("m", "locking"))).toBe(
      true,
    );
    expect(isLimitRefusalError(new Error("m"))).toBe(false);
    expect(isLimitRefusalError({ limit: "locking" })).toBe(false);
  });
});

describe("project delete transport", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("rejects a 403 refusal with the server message and the limit", async () => {
    fetchMock.mockResolvedValue(response(403, REFUSAL));
    const error: unknown = await httpProjectActionsTransport
      .delete("p1")
      .catch((e: unknown) => e);
    expect(isLimitRefusalError(error)).toBe(true);
    expect((error as LimitRefusalError).message).toBe("Do it at the desktop.");
    expect((error as LimitRefusalError).limit).toBe("projectDeletion");
  });

  it.each([401, 409, 500])(
    "keeps the present behaviour for %s",
    async (status) => {
      fetchMock.mockResolvedValue(response(status, { error: "server said" }));
      const error: unknown = await httpProjectActionsTransport
        .delete("p1")
        .catch((e: unknown) => e);
      expect(isLimitRefusalError(error)).toBe(false);
      expect((error as Error).message).toBe("server said");
    },
  );

  it("keeps the generic message for a malformed body", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("bad json");
      },
    } as unknown as Response);
    await expect(httpProjectActionsTransport.delete("p1")).rejects.toThrow(
      "Failed to delete project.",
    );
  });
});

describe("revision delete transport", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const context = { projectId: "p1", resourceId: "r1" };
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("rejects a 403 refusal with the server message and the limit", async () => {
    fetchMock.mockResolvedValue(
      response(403, { error: "Not here.", limit: "permanentDeletion" }),
    );
    const error: unknown = await removeRevision(context, "v1").catch(
      (e: unknown) => e,
    );
    expect(isLimitRefusalError(error)).toBe(true);
    expect((error as LimitRefusalError).message).toBe("Not here.");
    expect((error as LimitRefusalError).limit).toBe("permanentDeletion");
  });

  it.each([401, 409, 500])(
    "keeps the present behaviour for %s",
    async (status) => {
      fetchMock.mockResolvedValue(response(status, { error: "server said" }));
      const error: unknown = await removeRevision(context, "v1").catch(
        (e: unknown) => e,
      );
      expect(isLimitRefusalError(error)).toBe(false);
      expect((error as Error).message).toBe("server said");
    },
  );

  it("keeps the generic message for a malformed body", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("bad json");
      },
    } as unknown as Response);
    await expect(removeRevision(context, "v1")).rejects.toThrow(
      "Failed to delete revision.",
    );
  });
});
