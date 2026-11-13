/**
 * Feature 110 Task 11: lib/api/folklore.ts (variant read client). Fakes only:
 * `fetch` is spied and the native backend is mocked. Nothing here is evidence
 * about a device or the real route.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { readVariantText } from "../../src/lib/api/folklore";
import {
  isLockedAccessError,
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

const nativeTransport = vi.hoisted(() => ({ readVariantText: vi.fn() }));
vi.mock("../../src/store/transport/native-folklore-backend", () => ({
  createNativeFolkloreTransport: () => nativeTransport,
}));

const PID = "55555555-5555-4555-8555-555555555555";
const RID = "66666666-6666-4666-8666-666666666666";

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

describe("folklore transport: web runtime", () => {
  it("returns each typed result and sends ids only, no path", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    for (const body of [
      { kind: "text", text: "Once upon a time" },
      { kind: "none" },
      { kind: "unreadable", reason: "bad" },
      { kind: "locked" },
    ]) {
      fetchSpy.mockResolvedValueOnce(response(200, body));
      expect(await readVariantText(PID, RID)).toEqual(body);
    }
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toBe(
      `/api/folklore/variant-text?projectId=${PID}&resourceId=${RID}`,
    );
    expect(nativeTransport.readVariantText).not.toHaveBeenCalled();
  });

  it("maps a thrown fetch to unreadable, never none", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const result = await readVariantText(PID, RID);
    expect(result.kind).toBe("unreadable");
  });

  it("maps a non-ok response to unreadable with the server's message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(404, { error: "Project not found." }),
    );
    expect(await readVariantText(PID, RID)).toEqual({
      kind: "unreadable",
      reason: "Project not found.",
    });
  });

  it("uses a fixed reason when a failed response has no message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 500 }),
    );
    const result = await readVariantText(PID, RID);
    expect(result).toEqual({
      kind: "unreadable",
      reason: "The variant could not be read (HTTP 500).",
    });
  });

  it("maps a malformed 200 body to unreadable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, { kind: "weird" }),
    );
    expect((await readVariantText(PID, RID)).kind).toBe("unreadable");
  });

  it("rethrows the locked-access error for 401 and 409", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(response(401, { error: "locked" }));
    const first = await readVariantText(PID, RID).catch((e: unknown) => e);
    expect(first).toBeInstanceOf(ProjectLockedError);
    fetchSpy.mockResolvedValueOnce(response(409, { error: "key" }));
    const second = await readVariantText(PID, RID).catch((e: unknown) => e);
    expect(second).toBeInstanceOf(MissingProjectKeyError);
  });

  it("does not treat a not-paired 401 as locked", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(401, { error: "pair" }, { "x-getwrite-gate": "not-paired" }),
    );
    const result = await readVariantText(PID, RID);
    expect(result.kind).toBe("unreadable");
  });
});

describe("folklore transport: native runtime", () => {
  it("calls the native backend and never fetch", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    nativeTransport.readVariantText.mockResolvedValue({
      kind: "text",
      text: "x",
    });
    expect(await readVariantText(PID, RID)).toEqual({
      kind: "text",
      text: "x",
    });
    expect(nativeTransport.readVariantText).toHaveBeenCalledWith(PID, RID);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps a native failure to unreadable and rethrows a locked error", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    nativeTransport.readVariantText.mockRejectedValueOnce(
      new Error("native read failed"),
    );
    expect(await readVariantText(PID, RID)).toEqual({
      kind: "unreadable",
      reason: "native read failed",
    });
    const locked = new ProjectLockedError(PID);
    nativeTransport.readVariantText.mockRejectedValueOnce(locked);
    const caught = await readVariantText(PID, RID).catch((e: unknown) => e);
    expect(caught).toBe(locked);
    expect(isLockedAccessError(caught)).toBe(true);
  });
});
