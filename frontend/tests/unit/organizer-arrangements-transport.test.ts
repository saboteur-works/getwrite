/**
 * Feature 109 Task 27: lib/api/organizer-arrangements.ts (HTTP transport).
 * The native backend (Task 28) is not in this tree and is never loaded here.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addOrganizerArrangement,
  deleteOrganizerArrangement,
  renameOrganizerArrangement,
} from "../../src/lib/api/organizer-arrangements";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";
import { ProjectLockedError } from "../../src/lib/models/crypto/locked-errors";
import type { OrganizerArrangementAddInput } from "../../src/lib/models/organizer-grid-types";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

const ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const DRAFT: OrganizerArrangementAddInput = {
  name: "By plotline",
  source: { kind: "folder", folderId: "f1", scope: "children" },
  rows: { kind: "field", key: "plotline" },
  columns: "order",
};

function respond(status: number, body: unknown, headers?: HeadersInit) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(headers),
      json: async () => body,
    } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("payloads", () => {
  it("POSTs projectId plus the flat add operation", async () => {
    const spy = respond(200, { ok: true, id: ID });
    await expect(addOrganizerArrangement("p", DRAFT)).resolves.toEqual({
      ok: true,
      id: ID,
    });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/project/organizer-arrangements");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      projectId: "p",
      op: "add",
      ...DRAFT,
    });
  });

  it("sends rename and delete payloads", async () => {
    const spy = respond(200, { ok: true, id: ID });
    await renameOrganizerArrangement("p", { id: ID, name: "New" });
    await deleteOrganizerArrangement("p", { id: ID });
    expect(JSON.parse(String(spy.mock.calls[0][1]?.body))).toEqual({
      projectId: "p",
      op: "rename",
      id: ID,
      name: "New",
    });
    expect(JSON.parse(String(spy.mock.calls[1][1]?.body))).toEqual({
      projectId: "p",
      op: "delete",
      id: ID,
    });
  });
});

describe("refusals", () => {
  it.each([200, 400, 422])(
    "returns the refusal reason and message at status %i",
    async (status) => {
      respond(status, {
        ok: false,
        reason: "name-duplicate",
        message: "That name is already used.",
      });
      await expect(addOrganizerArrangement("p", DRAFT)).resolves.toEqual({
        ok: false,
        reason: "name-duplicate",
        message: "That name is already used.",
      });
    },
  );

  it("turns a non-2xx { error } body into a failed result with that text", async () => {
    respond(400, { error: "Invalid request body." });
    await expect(deleteOrganizerArrangement("p", { id: ID })).resolves.toEqual({
      ok: false,
      reason: "request-failed",
      message: "Invalid request body.",
    });
  });

  it("uses a status fallback message when the error body is unreadable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);
    const result = await deleteOrganizerArrangement("p", { id: ID });
    expect(result).toMatchObject({ ok: false, reason: "request-failed" });
    expect(result.ok === false && result.message).toContain("500");
  });
});

describe("failure visibility", () => {
  it("a network failure is a failed result, never ok", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    const result = await addOrganizerArrangement("p", DRAFT);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: "request-failed" });
  });

  it("a malformed 2xx body is a failed result, reported without the body", async () => {
    respond(200, { ok: true, secret: "x" });
    const result = await renameOrganizerArrangement("p", { id: ID, name: "n" });
    expect(result).toMatchObject({ ok: false, reason: "request-failed" });
    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
    expect(
      JSON.stringify(vi.mocked(reportTransportValidationFailure).mock.calls),
    ).not.toContain("secret");
  });

  it("an unknown refusal reason is a failed result", async () => {
    respond(200, { ok: false, reason: "bogus", message: "m" });
    await expect(addOrganizerArrangement("p", DRAFT)).resolves.toMatchObject({
      ok: false,
      reason: "request-failed",
    });
  });

  it("a locked project rethrows the locked-access error", async () => {
    respond(401, { error: "locked" });
    await expect(addOrganizerArrangement("p", DRAFT)).rejects.toBeInstanceOf(
      ProjectLockedError,
    );
  });

  it("an unpaired-device 401 is a failed result, not a locked error", async () => {
    respond(401, { error: "pair" }, { "x-getwrite-gate": "not-paired" });
    await expect(addOrganizerArrangement("p", DRAFT)).resolves.toMatchObject({
      ok: false,
      reason: "request-failed",
    });
  });
});

describe("source", () => {
  it("uses createTransport (raw runtime comparison), one route constant, no client UUIDs", () => {
    const src = readFileSync(
      new URL("../../src/lib/api/organizer-arrangements.ts", import.meta.url),
      "utf8",
    );
    expect(src).toContain("createTransport(");
    expect(src).not.toContain("resolveRuntime");
    expect(src).not.toContain("randomUUID");
    expect(src.match(/"\/api\//g)?.length).toBe(1);
  });
});
