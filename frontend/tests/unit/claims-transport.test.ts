/**
 * Feature 108 Task 16: lib/api/claims.ts (list, create, update-claim).
 * Fakes only: `fetch` is spied and the native backend (a Task 17 file) is
 * mocked by its assumed `createNativeClaimsTransport` export. Nothing here is
 * evidence about a device or the real route (Task 15).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { addClaim, listClaims, updateClaim } from "../../src/lib/api/claims";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";
import {
  isLockedAccessError,
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

const nativeTransport = vi.hoisted(() => ({
  list: vi.fn(),
  add: vi.fn(),
  update: vi.fn(),
}));
vi.mock("../../src/store/transport/native-claims-backend", () => ({
  createNativeClaimsTransport: () => nativeTransport,
}));

const PID = "55555555-5555-4555-8555-555555555555";
const RID = "66666666-6666-4666-8666-666666666666";
const CLAIM = {
  id: "c1",
  body: "The bridge opened in 1932.",
  quote: "opened in 1932",
  claim: { status: "unverified", statusChangedAt: "2026-11-11T10:00:00.000Z" },
  createdAt: "2026-11-11T10:00:00.000Z",
  updatedAt: "2026-11-11T10:00:00.000Z",
};
const NEW_CLAIM = { id: "c1", statement: CLAIM.body, quote: CLAIM.quote };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function response(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

describe("claims transport: web runtime", () => {
  it("lists with projectId only, no path, and keeps claim and failures", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        response(200, {
          claims: [
            { resourceId: RID, resourceName: "Chapter 1", annotation: CLAIM },
          ],
          failures: [
            {
              resourceId: "r2",
              resourceName: "Chapter 2",
              message: "unreadable",
            },
          ],
        }),
      );
    const result = await listClaims(PID);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe(`/api/claims?projectId=${PID}`);
    expect(init).toBeUndefined();
    expect(result.claims[0].annotation.claim).toEqual(CLAIM.claim);
    expect(result.failures).toEqual([
      { resourceId: "r2", resourceName: "Chapter 2", message: "unreadable" },
    ]);
    expect(nativeTransport.list).not.toHaveBeenCalled();
  });

  it("POSTs projectId, resourceId and the claim, and keeps claim on the result", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response(200, { annotation: CLAIM }));
    const stored = await addClaim(PID, RID, NEW_CLAIM);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/claims");
    expect(init?.method).toBe("POST");
    const sent = JSON.parse(String(init?.body));
    expect(sent).toEqual({ projectId: PID, resourceId: RID, claim: NEW_CLAIM });
    expect(JSON.stringify(sent)).not.toMatch(/path/i);
    expect(stored.claim).toEqual(CLAIM.claim);
  });

  it("PUTs the update with the annotation id and keeps claim on the result", async () => {
    const updated = {
      ...CLAIM,
      claim: {
        status: "verified",
        statusChangedAt: "2026-11-12T00:00:00.000Z",
      },
    };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response(200, { annotation: updated }));
    const stored = await updateClaim(PID, RID, "c1", {
      status: "verified",
      target: null,
    });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/claims");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      projectId: PID,
      resourceId: RID,
      annotationId: "c1",
      update: { status: "verified", target: null },
    });
    expect(stored.claim?.status).toBe("verified");
  });

  it("surfaces the server's error text and never an empty list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(500, { error: "Could not read annotations." }),
    );
    await expect(listClaims(PID)).rejects.toThrow(
      "Could not read annotations.",
    );
  });

  it("falls back to a status message when the error body is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("boom", { status: 502 }),
    );
    await expect(addClaim(PID, RID, NEW_CLAIM)).rejects.toThrow(/HTTP 502/);
  });

  it("rejects a malformed list body and reports it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, { claims: "nope" }),
    );
    await expect(listClaims(PID)).rejects.toThrow(/malformed/);
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "claims.listClaims",
      expect.any(Array),
    );
  });

  it("rejects a malformed write body and reports it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, { annotation: { id: 1 } }),
    );
    await expect(
      updateClaim(PID, RID, "c1", { status: "verified" }),
    ).rejects.toThrow(/malformed/);
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "claims.updateClaim",
      expect.any(Array),
    );
  });

  it("surfaces a locked project (401) as the locked-access error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(401, { error: "locked" }),
    );
    const error = await listClaims(PID).catch((e: unknown) => e);
    expect(isLockedAccessError(error)).toBe(true);
    expect(error).toBeInstanceOf(ProjectLockedError);
  });

  it("surfaces a missing project key (409) as the locked-access error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(409, { error: "key" }),
    );
    const error = await addClaim(PID, RID, NEW_CLAIM).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MissingProjectKeyError);
  });

  it("does not treat a not-paired 401 as locked", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(
        401,
        { error: "Pair this device." },
        { "x-getwrite-gate": "not-paired" },
      ),
    );
    const error = await listClaims(PID).catch((e: unknown) => e);
    expect(isLockedAccessError(error)).toBe(false);
    expect((error as Error).message).toBe("Pair this device.");
  });
});

describe("claims transport: native runtime", () => {
  it("calls the native backend and never fetch", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    nativeTransport.list.mockResolvedValue({ claims: [], failures: [] });
    nativeTransport.add.mockResolvedValue(CLAIM);
    nativeTransport.update.mockResolvedValue(CLAIM);

    await expect(listClaims(PID)).resolves.toEqual({
      claims: [],
      failures: [],
    });
    await expect(addClaim(PID, RID, NEW_CLAIM)).resolves.toEqual(CLAIM);
    await expect(
      updateClaim(PID, RID, "c1", { statement: "x" }),
    ).resolves.toEqual(CLAIM);

    expect(nativeTransport.list).toHaveBeenCalledWith(PID);
    expect(nativeTransport.add).toHaveBeenCalledWith(PID, RID, NEW_CLAIM);
    expect(nativeTransport.update).toHaveBeenCalledWith(PID, RID, "c1", {
      statement: "x",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rethrows a native failure untouched", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    const failure = new Error("native read failed");
    nativeTransport.list.mockRejectedValue(failure);
    await expect(listClaims(PID)).rejects.toBe(failure);
  });
});
