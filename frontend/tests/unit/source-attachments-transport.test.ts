/**
 * Feature 102 Task 27: lib/api/source-attachments.ts (HTTP client). Every
 * method rejects with the server's message on a refusal and never sends a path.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addAttachment,
  listAttachments,
  removeAttachment,
  reorderAttachments,
  replaceAttachment,
} from "../../src/lib/api/source-attachments";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

const ENTRY = {
  id: "11111111-1111-4111-8111-111111111111",
  fileName: "attachment-22222222-2222-4222-8222-222222222222.png",
  originalName: "a.png",
  mime: "image/png",
  size: 12,
  addedAt: "2026-01-01T00:00:00.000Z",
};
const P = "33333333-3333-4333-8333-333333333333";
const R = "44444444-4444-4444-8444-444444444444";
const FILE = new File([new Uint8Array([1])], "a.png", { type: "image/png" });

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe("HTTP client", () => {
  it("lists with projectId and resourceId in the query only", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok([ENTRY]));
    await expect(listAttachments(P, R)).resolves.toEqual([ENTRY]);
    expect(String(spy.mock.calls[0][0])).toBe(
      `/api/project/source-attachments?projectId=${P}&resourceId=${R}`,
    );
  });

  it("adds and replaces with multipart and no path field", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok(ENTRY));
    await expect(addAttachment(P, R, FILE)).resolves.toEqual(ENTRY);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/project/source-attachments");
    expect(init?.method).toBe("POST");
    const data = init?.body as FormData;
    expect([...data.keys()].sort()).toEqual([
      "file",
      "projectId",
      "resourceId",
    ]);

    spy.mockResolvedValue(ok({ trashId: ENTRY.id, entry: ENTRY }));
    await expect(replaceAttachment(P, R, ENTRY.id, FILE)).resolves.toEqual({
      trashId: ENTRY.id,
      entry: ENTRY,
    });
    expect(spy.mock.calls[1][1]?.method).toBe("PUT");
    expect([...(spy.mock.calls[1][1]?.body as FormData).keys()].sort()).toEqual(
      ["attachmentId", "file", "projectId", "resourceId"],
    );
  });

  it("removes and reorders with JSON bodies", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(ok({ trashId: ENTRY.id }));
    await expect(removeAttachment(P, R, ENTRY.id)).resolves.toEqual({
      trashId: ENTRY.id,
    });
    expect(spy.mock.calls[0][1]?.method).toBe("DELETE");
    expect(JSON.parse(String(spy.mock.calls[0][1]?.body))).toEqual({
      projectId: P,
      resourceId: R,
      attachmentId: ENTRY.id,
    });
    spy.mockResolvedValue(ok([ENTRY]));
    await expect(reorderAttachments(P, R, [ENTRY.id])).resolves.toEqual([
      ENTRY,
    ]);
    expect(spy.mock.calls[1][1]?.method).toBe("PATCH");
    expect(JSON.parse(String(spy.mock.calls[1][1]?.body))).toEqual({
      projectId: P,
      resourceId: R,
      orderedIds: [ENTRY.id],
    });
  });

  it("rejects with the server's message on a refusal", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Refused text." }),
    } as Response);
    await expect(addAttachment(P, R, FILE)).rejects.toThrow("Refused text.");
    await expect(listAttachments(P, R)).rejects.toThrow("Refused text.");
  });

  it("rejects, reporting without the body, on a malformed response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok({ nope: 1 }));
    await expect(addAttachment(P, R, FILE)).rejects.toThrow(/malformed/);
    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
  });
});
