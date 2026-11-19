/**
 * Feature 121 Task 32: lib/api/merge.ts (client for the merge preview and
 * merge routes, FR-15). Fakes only: `fetch` is spied; nothing here is evidence
 * about the real routes, a hosted tenant, a paired device or Android.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MERGE_INVALID_REQUEST_MESSAGE,
  MERGE_REQUEST_LIMITS,
  MERGE_TRANSPORT_FAILED_MESSAGE,
  MERGE_TRANSPORT_STATE_UNKNOWN_MESSAGE,
  parseMergeBody,
  parseMergePreviewBody,
  requestMerge,
  requestMergePreview,
} from "../../src/lib/api/merge";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { MERGE_DOCUMENT_CAP } from "../../src/lib/models/merge-limits";
import {
  describeMergeAnnotationLimit,
  describeMergeDocumentCap,
  describeMergeFailure,
  describeMergeIndexFailure,
  MERGE_ANNOTATION_LIMIT_MESSAGE,
  MERGE_REFUSAL_MESSAGES,
} from "../../src/lib/models/merge-messages";
import type { MergePreviewDocumentRef } from "../../src/lib/models/merge-preview-core";
import { MERGE_REFUSAL_REASONS } from "../../src/lib/models/merge-types";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

const PID = "55555555-5555-4555-8555-555555555555";
const T = "66666666-6666-4666-8666-666666666666";
const A = "77777777-7777-4777-8777-777777777777";
const B = "88888888-8888-4888-8888-888888888888";
const HASH = "a".repeat(64);
const REV = "34205ec3-fe37-41ee-96f9-e331e95e5475";
const doc = (id: string): MergePreviewDocumentRef => ({
  resourceId: id,
  revisionId: REV,
  contentHash: HASH,
});
const DOCUMENTS = [doc(T), doc(A), doc(B)];
const CARRY = {
  annotationIds: ["a1"],
  fields: [
    { field: "status", sourceDocumentId: A },
    { field: "pov", sourceDocumentId: null },
  ],
  unitedMultiselectFields: ["tags"],
};
const PREVIEW_BODY = {
  outcome: "preview",
  target: { documentId: T, name: "T", folderPath: [], words: 3 },
  absorbed: [
    {
      documentId: A,
      name: "A",
      folderPath: ["Part 1"],
      words: 4,
      rules: ["It is left out of compile, in every format."],
    },
  ],
  annotations: [
    {
      documentId: A,
      notes: [{ id: "a1", body: "n" }],
      citations: [],
      claims: [],
    },
  ],
  metadata: [{ field: "status", values: [{ documentId: A, value: "Final" }] }],
  warnings: [{ kind: "target-in-inbox", message: "w" }],
};
const APPLIED = {
  outcome: "applied",
  targetDocumentId: T,
  absorbedDocumentIds: [A, B],
  notices: [],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function response(
  status: number,
  body: unknown,
  headers?: HeadersInit,
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function sentBody(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

describe("request validators", () => {
  it("accept the documents of a preview and nothing else", () => {
    expect(
      parseMergePreviewBody({ projectId: PID, documents: DOCUMENTS }),
    ).toEqual({
      ok: true,
      value: { projectId: PID, request: { documents: DOCUMENTS } },
    });
    for (const bad of [
      null,
      [],
      { projectId: PID },
      { projectId: PID, documents: [] },
      { projectId: PID, documents: DOCUMENTS, path: "/etc/x" },
      { projectId: PID, documents: DOCUMENTS, projectRoot: "/x" },
      { projectId: "../x", documents: DOCUMENTS },
      { projectId: PID, documents: [{ ...doc(T), resourceId: "../x" }] },
      { projectId: PID, documents: [{ ...doc(T), revisionId: "v-1" }] },
      { projectId: PID, documents: [{ ...doc(T), contentHash: "zz" }] },
      { projectId: PID, documents: [{ ...doc(T), extra: 1 }] },
    ])
      expect(parseMergePreviewBody(bad)).toEqual({ ok: false });
  });

  it("accepts a count over the cap (the core refuses it with the cap text) but not an unbounded list", () => {
    const over = Array.from({ length: MERGE_DOCUMENT_CAP + 1 }, () => doc(T));
    expect(parseMergePreviewBody({ projectId: PID, documents: over }).ok).toBe(
      true,
    );
    const huge = Array.from(
      { length: MERGE_REQUEST_LIMITS.maxDocuments + 1 },
      () => doc(T),
    );
    expect(parseMergePreviewBody({ projectId: PID, documents: huge })).toEqual({
      ok: false,
    });
  });

  it("accept the carry-over of a merge and refuse anything malformed in it", () => {
    expect(
      parseMergeBody({ projectId: PID, documents: DOCUMENTS, carryOver: CARRY })
        .ok,
    ).toBe(true);
    const base = { projectId: PID, documents: DOCUMENTS };
    for (const bad of [
      base,
      { ...base, carryOver: [] },
      { ...base, carryOver: { ...CARRY, extra: 1 } },
      { ...base, carryOver: { ...CARRY, annotationIds: [1] } },
      { ...base, carryOver: { ...CARRY, fields: ["status"] } },
      {
        ...base,
        carryOver: {
          ...CARRY,
          fields: [{ field: "s", sourceDocumentId: "x" }],
        },
      },
      {
        ...base,
        carryOver: {
          ...CARRY,
          fields: [{ field: "s", sourceDocumentId: A, extra: 1 }],
        },
      },
      { ...base, carryOver: { ...CARRY, unitedMultiselectFields: [{}] } },
      {
        ...base,
        carryOver: {
          ...CARRY,
          annotationIds: Array.from(
            { length: MERGE_REQUEST_LIMITS.maxAnnotationIds + 1 },
            () => "a",
          ),
        },
      },
    ])
      expect(parseMergeBody(bad)).toEqual({ ok: false });
  });
});

describe("requestMergePreview", () => {
  it("posts only the validated fields and returns the preview", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response(200, PREVIEW_BODY));
    const result = await requestMergePreview(PID, {
      documents: [{ ...doc(T), extra: "SECRET" } as never, doc(A)],
    });
    expect(result).toEqual({ kind: "preview", preview: PREVIEW_BODY });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/project/merge/preview");
    expect(init?.method).toBe("POST");
    expect(sentBody(init)).toEqual({
      projectId: PID,
      documents: [doc(T), doc(A)],
    });
  });

  it("maps a stale refusal to its own kind and every other refusal to a reason naming the document", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        outcome: "refused",
        reason: MERGE_REFUSAL_REASONS.staleContent,
        documentId: A,
        message: "server text",
      }),
    );
    expect(await requestMergePreview(PID, { documents: DOCUMENTS })).toEqual({
      kind: "stale",
      documentId: A,
      message: MERGE_REFUSAL_MESSAGES["stale-content"],
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        outcome: "refused",
        reason: MERGE_REFUSAL_REASONS.mergedAbsorbed,
        documentId: B,
        message: "server text",
      }),
    );
    expect(await requestMergePreview(PID, { documents: DOCUMENTS })).toEqual({
      kind: "refused",
      reason: "merged-absorbed",
      documentId: B,
      message: MERGE_REFUSAL_MESSAGES["merged-absorbed"],
    });
  });

  it("states the cap with the cap constant when the count is over it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        outcome: "refused",
        reason: MERGE_REFUSAL_REASONS.tooManyDocuments,
        documentId: null,
        message: "server text",
      }),
    );
    const result = await requestMergePreview(PID, { documents: DOCUMENTS });
    expect(result).toMatchObject({
      kind: "refused",
      reason: "too-many-documents",
      documentId: null,
      message: describeMergeDocumentCap(MERGE_DOCUMENT_CAP),
    });
    expect((result as { message: string }).message).toContain(
      String(MERGE_DOCUMENT_CAP),
    );
  });

  it("maps a server failure, a thrown fetch, a non-ok status and a malformed body to failed, never to no result", async () => {
    for (const next of [
      () => response(200, { outcome: "failed", cause: "content-unreadable" }),
      () => response(500, {}),
      () => response(200, { outcome: "bogus" }),
      () => response(200, { outcome: "preview", target: 1 }),
    ]) {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(next());
      expect(await requestMergePreview(PID, { documents: DOCUMENTS })).toEqual({
        kind: "failed",
        message: MERGE_TRANSPORT_FAILED_MESSAGE,
      });
    }
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("net"));
    expect(await requestMergePreview(PID, { documents: DOCUMENTS })).toEqual({
      kind: "failed",
      message: MERGE_TRANSPORT_FAILED_MESSAGE,
    });
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "merge.requestMergePreview",
      expect.anything(),
    );
  });

  it("rethrows the locked error for 401 and 409 and not a not-paired 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response(401, {}));
    await expect(
      requestMergePreview(PID, { documents: DOCUMENTS }),
    ).rejects.toBeInstanceOf(ProjectLockedError);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response(409, {}));
    await expect(
      requestMergePreview(PID, { documents: DOCUMENTS }),
    ).rejects.toBeInstanceOf(MissingProjectKeyError);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(401, {}, { "x-getwrite-gate": "not-paired" }),
    );
    expect(
      await requestMergePreview(PID, { documents: DOCUMENTS }),
    ).toMatchObject({ kind: "failed" });
  });

  it("does not send a bad id", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await requestMergePreview("../x", { documents: DOCUMENTS })).toEqual(
      { kind: "failed", message: MERGE_INVALID_REQUEST_MESSAGE },
    );
    expect(
      await requestMergePreview(PID, {
        documents: [{ ...doc(T), resourceId: "../x" }],
      }),
    ).toMatchObject({ kind: "failed" });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("requestMerge", () => {
  const send = (): ReturnType<typeof requestMerge> =>
    requestMerge(PID, { documents: DOCUMENTS, carryOver: CARRY });

  it("posts only the validated fields and returns applied", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response(200, APPLIED));
    const result = await requestMerge(PID, {
      documents: DOCUMENTS,
      carryOver: { ...CARRY, extra: "SECRET" } as never,
    });
    expect(result).toEqual({ kind: "applied", ...omitOutcome(APPLIED) });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/project/merge");
    expect(sentBody(init)).toEqual({
      projectId: PID,
      documents: DOCUMENTS,
      carryOver: CARRY,
    });
  });

  it("maps index-failed to its own kind with the failures and the Task 27 text, not the server's", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        ...APPLIED,
        outcome: "index-failed",
        failures: [{ documentId: T, step: "backlinks" }],
        message: "server text",
      }),
    );
    expect(await send()).toEqual({
      kind: "index-failed",
      ...omitOutcome(APPLIED),
      failures: [{ documentId: T, step: "backlinks" }],
      message: describeMergeIndexFailure(["backlinks"]),
    });
  });

  it("maps a stale refusal, a refusal naming a document and an annotation-limit refusal to three kinds", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        outcome: "refused",
        reason: "stale-content",
        documentId: A,
      }),
    );
    expect(await send()).toEqual({
      kind: "stale",
      documentId: A,
      message: MERGE_REFUSAL_MESSAGES["stale-content"],
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, { outcome: "refused", reason: "folder", documentId: B }),
    );
    expect(await send()).toEqual({
      kind: "refused",
      reason: "folder",
      documentId: B,
      message: MERGE_REFUSAL_MESSAGES.folder,
    });
    const counts = { existing: 499, incoming: 2, limit: 500 };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        outcome: "refused",
        reason: "annotation-limit",
        documentId: null,
        annotationCounts: counts,
      }),
    );
    expect(await send()).toEqual({
      kind: "annotation-limit",
      counts,
      message: describeMergeAnnotationLimit(counts),
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        outcome: "refused",
        reason: "annotation-limit",
        documentId: null,
      }),
    );
    expect(await send()).toEqual({
      kind: "annotation-limit",
      counts: null,
      message: MERGE_ANNOTATION_LIMIT_MESSAGE,
    });
  });

  it("states the cap with the cap constant when the count is over it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        outcome: "refused",
        reason: "too-many-documents",
        documentId: null,
      }),
    );
    expect(await send()).toMatchObject({
      kind: "refused",
      message: describeMergeDocumentCap(MERGE_DOCUMENT_CAP),
    });
  });

  it("maps failed to the step and the state that remains, with the Task 16 text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        outcome: "failed",
        failedStep: "append-to-target",
        remainingState: "partially-written",
        cause: "Error",
      }),
    );
    expect(await send()).toEqual({
      kind: "failed",
      failedStep: "append-to-target",
      remainingState: "partially-written",
      message: describeMergeFailure("append-to-target", "partially-written"),
    });
  });

  it("maps a thrown fetch, a non-ok status and a malformed body to failed with an unknown state, never to no result", async () => {
    const unknown = {
      kind: "failed",
      failedStep: null,
      remainingState: "state-unknown",
      message: MERGE_TRANSPORT_STATE_UNKNOWN_MESSAGE,
    };
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("net"));
    expect(await send()).toEqual(unknown);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response(500, {}));
    expect(await send()).toEqual(unknown);
    for (const body of [
      { outcome: "bogus" },
      { outcome: "failed", failedStep: "x", remainingState: "y", cause: "c" },
      { outcome: "refused", reason: "not-a-reason", documentId: null },
    ]) {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(response(200, body));
      expect(await send()).toEqual(unknown);
    }
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "merge.requestMerge",
      expect.anything(),
    );
  });

  it("rethrows the locked error and does not send a bad request", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response(401, {}));
    await expect(send()).rejects.toBeInstanceOf(ProjectLockedError);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response(409, {}));
    await expect(send()).rejects.toBeInstanceOf(MissingProjectKeyError);
    const spy = vi.spyOn(globalThis, "fetch");
    spy.mockClear();
    const result = await requestMerge(PID, {
      documents: DOCUMENTS,
      carryOver: { ...CARRY, annotationIds: [1] } as never,
    });
    expect(result).toMatchObject({
      kind: "failed",
      remainingState: "documents-restored",
      message: MERGE_INVALID_REQUEST_MESSAGE,
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("transport shape", () => {
  it("is HTTP only: no createTransport, no native backend and no node import in the client", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../src/lib/api/merge.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/createTransport|native-merge|node:/);
    for (const name of [
      "native-merge-backend.ts",
      "native-merge-backend.web-stub.ts",
    ])
      expect(
        existsSync(path.resolve(__dirname, "../../src/store/transport", name)),
      ).toBe(false);
  });
});

function omitOutcome<T extends { outcome: string }>(
  body: T,
): Omit<T, "outcome"> {
  const copy: Partial<T> = { ...body };
  delete copy.outcome;
  return copy as Omit<T, "outcome">;
}
