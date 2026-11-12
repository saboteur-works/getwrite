/**
 * Feature 109 Task 13: client transport for the Organizer field write.
 * The native backend (Task 14) is mocked at its module specifier; its assumed
 * shape is `createNativeOrganizerFieldWriteTransport()` returning
 * `{ setOrganizerFields(projectId, input) }`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ORGANIZER_FIELD_WRITE_ENDPOINT,
  setOrganizerFields,
} from "../../src/lib/api/organizer-field-write";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/crypto/locked-errors";
import { ResourceGoneError } from "../../src/lib/models/resource-gone-error";
import type { OrganizerFieldWriteInput } from "../../src/lib/models/organizer-grid-types";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

const nativeSet = vi.fn();
vi.mock(
  "../../src/store/transport/native-organizer-field-write-backend",
  () => ({
    createNativeOrganizerFieldWriteTransport: () => ({
      setOrganizerFields: nativeSet,
    }),
  }),
);

const INPUT: OrganizerFieldWriteInput = {
  resourceId: "r1",
  changes: [
    { target: { kind: "status" }, op: "set", value: "Draft" },
    { target: { kind: "field", key: "mood" }, op: "clear" },
  ],
};

function response(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("HTTP", () => {
  it("PUTs projectId and input to the route constant and parses a done result", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response(200, { ok: true, resourceId: "r1" }));
    await expect(setOrganizerFields("p", INPUT)).resolves.toEqual({
      status: "done",
      resourceId: "r1",
    });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(ORGANIZER_FIELD_WRITE_ENDPOINT);
    expect(ORGANIZER_FIELD_WRITE_ENDPOINT).toBe("/api/project/organizer-field");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      projectId: "p",
      input: INPUT,
    });
  });

  it("returns a refusal carried by a 200 body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        ok: false,
        reason: "value-not-in-list",
        message: "Not in the list.",
      }),
    );
    await expect(setOrganizerFields("p", INPUT)).resolves.toEqual({
      status: "refused",
      reason: "value-not-in-list",
      message: "Not in the list.",
    });
  });

  it("returns a refusal carried by a 4xx body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(400, { ok: false, reason: "field-locked", message: "Locked." }),
    );
    await expect(setOrganizerFields("p", INPUT)).resolves.toEqual({
      status: "refused",
      reason: "field-locked",
      message: "Locked.",
    });
  });

  it("maps a resource-gone 404 to the gone result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(404, { error: "gone", code: "resource-gone" }),
    );
    await expect(setOrganizerFields("p", INPUT)).resolves.toEqual({
      status: "gone",
    });
  });

  it("does not call a 404 without the resource-gone code a gone resource", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(404, { error: "Project not found" }),
    );
    await expect(setOrganizerFields("p", INPUT)).resolves.toEqual({
      status: "failed",
      message: "Project not found",
    });
  });

  it("maps 401 to ProjectLockedError and 409 to MissingProjectKeyError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      response(401, { error: "locked" }),
    );
    await expect(setOrganizerFields("p", INPUT)).rejects.toBeInstanceOf(
      ProjectLockedError,
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      response(409, { error: "no key" }),
    );
    await expect(setOrganizerFields("p", INPUT)).rejects.toBeInstanceOf(
      MissingProjectKeyError,
    );
  });

  it("leaves a not-paired 401 as a failure, not a locked error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(
        401,
        { error: "not paired" },
        { "x-getwrite-gate": "not-paired" },
      ),
    );
    await expect(setOrganizerFields("p", INPUT)).resolves.toMatchObject({
      status: "failed",
    });
  });

  it("returns a failed result with the server message on a 500", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(500, { error: "boom" }),
    );
    await expect(setOrganizerFields("p", INPUT)).resolves.toEqual({
      status: "failed",
      message: "boom",
    });
  });

  it("returns a failed result with the status when the error body is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html>", { status: 502 }),
    );
    const result = await setOrganizerFields("p", INPUT);
    expect(result).toMatchObject({ status: "failed" });
    expect(JSON.stringify(result)).toContain("502");
  });

  it("returns a failed result, never done, on a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    const result = await setOrganizerFields("p", INPUT);
    expect(result.status).toBe("failed");
    expect(result).not.toHaveProperty("resourceId");
  });

  it("reports a malformed 200 body without passing it and returns failed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, { ok: "yes", secret: "SECRET-BODY-VALUE" }),
    );
    const result = await setOrganizerFields("p", INPUT);
    expect(result.status).toBe("failed");
    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
    const args = vi.mocked(reportTransportValidationFailure).mock.calls[0];
    expect(args[0]).toBe("organizer-field-write.setOrganizerFields");
    expect(JSON.stringify(args)).not.toContain("SECRET-BODY-VALUE");
  });

  it("treats a 200 with an unknown refusal reason as malformed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, { ok: false, reason: "made-up", message: "x" }),
    );
    await expect(setOrganizerFields("p", INPUT)).resolves.toMatchObject({
      status: "failed",
    });
  });
});

describe("native path", () => {
  const useNative = () => vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");

  it("calls the native backend, not fetch, and maps a done result", async () => {
    useNative();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    nativeSet.mockResolvedValue({ ok: true, resourceId: "r1" });
    await expect(setOrganizerFields("p", INPUT)).resolves.toEqual({
      status: "done",
      resourceId: "r1",
    });
    expect(nativeSet).toHaveBeenCalledWith("p", INPUT);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps a refusal result", async () => {
    useNative();
    nativeSet.mockResolvedValue({
      ok: false,
      reason: "unknown-field",
      message: "No such field.",
    });
    await expect(setOrganizerFields("p", INPUT)).resolves.toEqual({
      status: "refused",
      reason: "unknown-field",
      message: "No such field.",
    });
  });

  it("maps ResourceGoneError to the same gone result as a 404", async () => {
    useNative();
    nativeSet.mockRejectedValue(new ResourceGoneError("r1"));
    await expect(setOrganizerFields("p", INPUT)).resolves.toEqual({
      status: "gone",
    });
  });

  it("rethrows a locked-access error", async () => {
    useNative();
    nativeSet.mockRejectedValue(new ProjectLockedError("p"));
    await expect(setOrganizerFields("p", INPUT)).rejects.toBeInstanceOf(
      ProjectLockedError,
    );
  });

  it("maps any other native error to a failed result", async () => {
    useNative();
    nativeSet.mockRejectedValue(new Error("disk full"));
    await expect(setOrganizerFields("p", INPUT)).resolves.toEqual({
      status: "failed",
      message: "disk full",
    });
  });

  it("treats a malformed native result as failed", async () => {
    useNative();
    nativeSet.mockResolvedValue({ ok: "maybe" });
    await expect(setOrganizerFields("p", INPUT)).resolves.toMatchObject({
      status: "failed",
    });
  });
});
