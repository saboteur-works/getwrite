/**
 * Feature 116 Task 19: lib/api/citation-fields.ts. Fakes only: `fetch` is
 * spied; nothing here is evidence about the real route or a device.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readCitationFields,
  writeCitationFields,
} from "../../src/lib/api/citation-fields";
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

const PID = "55555555-5555-4555-8555-555555555555";
const RID = "66666666-6666-4666-8666-666666666666";
const FIELDS = {
  referenceType: "book",
  title: "A Title",
  authors: [{ family: "Doe", given: "Jane" }],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("readCitationFields", () => {
  it("returns the stored fields and sends only projectId and resourceId", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response(200, { kind: "fields", fields: FIELDS }));
    const result = await readCitationFields(PID, RID);
    expect(result).toEqual({ kind: "fields", fields: FIELDS });
    const [url, init] = spy.mock.calls[0];
    const parsed = new URL(String(url), "http://localhost");
    expect(parsed.pathname).toBe("/api/citations/fields");
    expect([...parsed.searchParams.keys()].sort()).toEqual([
      "projectId",
      "resourceId",
    ]);
    expect(init?.method ?? "GET").toBe("GET");
  });

  it("returns fields null (no fields stored) distinct from failed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, { kind: "fields", fields: null }),
    );
    expect(await readCitationFields(PID, RID)).toEqual({
      kind: "fields",
      fields: null,
    });
  });

  it("maps a server-reported failed body to failed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, { kind: "failed", message: "x" }),
    );
    expect((await readCitationFields(PID, RID)).kind).toBe("failed");
  });

  it("maps a thrown fetch to failed, never to no fields", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    expect((await readCitationFields(PID, RID)).kind).toBe("failed");
  });

  it("maps a non-ok response to failed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(500, { error: "boom" }),
    );
    expect((await readCitationFields(PID, RID)).kind).toBe("failed");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(404, { error: "nope" }),
    );
    expect((await readCitationFields(PID, RID)).kind).toBe("failed");
  });

  it("maps a malformed body to failed and reports without the body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, { kind: "fields", fields: { referenceType: "bogus" } }),
    );
    expect((await readCitationFields(PID, RID)).kind).toBe("failed");
    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
  });

  it("rethrows the locked-access error for 401 and 409", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(401, { error: "locked" }),
    );
    await expect(readCitationFields(PID, RID)).rejects.toBeInstanceOf(
      ProjectLockedError,
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(409, { error: "key" }),
    );
    const error: unknown = await readCitationFields(PID, RID).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(MissingProjectKeyError);
    expect(isLockedAccessError(error)).toBe(true);
  });
});

describe("writeCitationFields", () => {
  it("sends only projectId, resourceId and the validated fields", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response(200, { fields: FIELDS }));
    const result = await writeCitationFields(PID, RID, FIELDS);
    expect(result).toEqual({ kind: "saved", fields: FIELDS });
    const [, init] = spy.mock.calls[0];
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      projectId: PID,
      resourceId: RID,
      fields: FIELDS,
    });
  });

  it("does not send invalid fields and reports failed", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await writeCitationFields(PID, RID, {
      referenceType: "book",
      nope: "x",
    });
    expect(result.kind).toBe("failed");
    expect(spy).not.toHaveBeenCalled();
  });

  it("maps a thrown fetch and a non-ok response to failed", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    expect((await writeCitationFields(PID, RID, FIELDS)).kind).toBe("failed");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(400, { error: "bad" }),
    );
    expect((await writeCitationFields(PID, RID, FIELDS)).kind).toBe("failed");
  });

  it("maps a malformed body to failed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, { fields: 5 }),
    );
    expect((await writeCitationFields(PID, RID, FIELDS)).kind).toBe("failed");
    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
  });

  it("rethrows the locked-access error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(401, { error: "locked" }),
    );
    await expect(writeCitationFields(PID, RID, FIELDS)).rejects.toBeInstanceOf(
      ProjectLockedError,
    );
  });
});
