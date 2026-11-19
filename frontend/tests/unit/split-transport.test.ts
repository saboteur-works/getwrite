/**
 * Feature 120 Task 23: lib/api/split.ts (client for the preview and split
 * routes, FR-14). Fakes only: `fetch` is spied; nothing here is evidence about
 * the real routes, a hosted tenant, a paired device or Android.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as client from "../../src/lib/api/split";
import {
  parseSplitLatestQuery,
  parseSplitUndoBody,
  requestLatestSplitOperation,
  requestSplit,
  requestSplitPreview,
  requestUndoSplit,
  SPLIT_INVALID_REQUEST_MESSAGE,
  SPLIT_TRANSPORT_FAILED_MESSAGE,
  SPLIT_TRANSPORT_STATE_UNKNOWN_MESSAGE,
} from "../../src/lib/api/split";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";
import {
  isLockedAccessError,
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { MERGE_UNDO_REFUSAL_MESSAGES } from "../../src/lib/models/merge-undo-messages";
import { hashSplitContent as contentHashModule } from "../../src/lib/models/split-content-hash";
import { hashSplitContent as serverHash } from "../../src/lib/models/split-preview-core";
import {
  describeSplitFailure,
  describeSplitIndexFailure,
  SPLIT_REFUSAL_MESSAGES,
  SPLIT_UNDO_REFUSAL_MESSAGES,
} from "../../src/lib/models/split-messages";
import { SPLIT_REFUSAL_REASONS } from "../../src/lib/models/split-types";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

const PID = "55555555-5555-4555-8555-555555555555";
const RID = "66666666-6666-4666-8666-666666666666";
const NEW_ID = "77777777-7777-4777-8777-777777777777";
const HASH = "a".repeat(64);
const PREVIEW_REQUEST = {
  resourceId: RID,
  revisionId: "34205ec3-fe37-41ee-96f9-e331e95e5475",
  contentHash: HASH,
  offset: 12,
};
const APPLY_REQUEST = {
  ...PREVIEW_REQUEST,
  carryOver: { annotationIds: ["a1"], fields: ["status"], newName: "Part 2" },
};
const PREVIEW_BODY = {
  outcome: "preview",
  revisionId: "34205ec3-fe37-41ee-96f9-e331e95e5475",
  contentHash: HASH,
  offset: 12,
  documentName: "Doc",
  defaultNewName: "Doc (part 2)",
  firstHalfWords: 3,
  secondHalfWords: 4,
  anchored: {
    notes: [{ id: "a1", body: "n", kind: "note" }],
    citations: [],
    claims: [],
  },
  spanning: [],
  fields: [{ key: "status", label: "Status", hasValue: true }],
};
const APPLIED = {
  outcome: "applied",
  newDocumentId: NEW_ID,
  notices: [],
  snapshotRevisionId: "5b0c7f0e-8a3d-4c55-9d1e-2f6a1c9b7e42",
  snapshotRevisionNumber: 2,
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

describe("the one hash function", () => {
  it("is the same function object on the client, the server and the leaf module", () => {
    expect(client.hashSplitContent).toBe(serverHash);
    expect(contentHashModule).toBe(serverHash);
  });

  it("is SHA-256 of the UTF-8 bytes, lower-case hex", () => {
    for (const text of ["", "abc", "café \u{1F600} ".repeat(40)]) {
      expect(client.hashSplitContent(text)).toBe(
        createHash("sha256").update(text, "utf8").digest("hex"),
      );
    }
  });

  it("the leaf module imports nothing (no node:*, no server code)", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../src/lib/models/split-content-hash.ts"),
      "utf8",
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/^\s*import\s/m);
    expect(code).not.toMatch(/node:|require\(|import\(/);
  });
});

describe("requestUndoSplit (Feature 120 Task 31)", () => {
  const UNDO_APPLIED = {
    outcome: "applied",
    originalDocumentId: RID,
    splitOffDocumentId: NEW_ID,
    splitOffState: "moved-to-trash",
    preservedRevisions: [
      {
        documentId: RID,
        revisionId: "9d2f4a6c-1b7e-4e08-a3c5-7e1d0b4f8a63",
        revisionNumber: 3,
      },
    ],
    movedAnnotationIds: ["a1"],
  };

  it("posts only the validated project id and returns applied", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response(200, UNDO_APPLIED));
    const result = await requestUndoSplit(PID);
    expect(result).toEqual({
      kind: "applied",
      originalDocumentId: RID,
      splitOffDocumentId: NEW_ID,
      splitOffState: "moved-to-trash",
      preservedRevisions: UNDO_APPLIED.preservedRevisions,
      movedAnnotationIds: ["a1"],
    });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/project/split/undo");
    expect(init?.method).toBe("POST");
    expect(sentBody(init)).toEqual({ projectId: PID });
  });

  it("maps index-failed to a success kind carrying the failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        ...UNDO_APPLIED,
        outcome: "index-failed",
        failures: [{ documentId: RID, step: "inverted-index" }],
      }),
    );
    expect(await requestUndoSplit(PID)).toMatchObject({
      kind: "index-failed",
      failures: [{ documentId: RID, step: "inverted-index" }],
    });
  });

  it("maps nothing-to-undo, unsupported-operation and could-not-be-checked to their own kinds", async () => {
    const bodies = [
      [{ outcome: "nothing-to-undo" }, { kind: "nothing-to-undo" }],
      [
        { outcome: "unsupported-operation", kind: "future-kind" },
        { kind: "unsupported-operation", operationKind: "future-kind" },
      ],
      [
        { outcome: "could-not-be-checked", cause: "record-malformed" },
        { kind: "could-not-be-checked", cause: "record-malformed" },
      ],
    ] as const;
    for (const [body, expected] of bodies) {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(response(200, body));
      expect(await requestUndoSplit(PID)).toEqual(expected);
    }
  });

  it("maps a refusal to its reason and the Undo refusal text, not the server's text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        outcome: "refused",
        reason: "original-in-trash",
        message: "server text",
      }),
    );
    expect(await requestUndoSplit(PID)).toEqual({
      kind: "refused",
      reason: "original-in-trash",
      message: SPLIT_UNDO_REFUSAL_MESSAGES["original-in-trash"],
    });
  });

  it("maps failed to the step and the state that remains", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        outcome: "failed",
        failedStep: "restore-original",
        cause: "Error",
        remainingState: "original-not-restored",
      }),
    );
    expect(await requestUndoSplit(PID)).toEqual({
      kind: "failed",
      failedStep: "restore-original",
      remainingState: "original-not-restored",
      cause: "Error",
    });
  });

  it("maps a thrown fetch, a non-ok status and a malformed body to failed with an unknown state, never to no result", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("net"));
    expect(await requestUndoSplit(PID)).toEqual({
      kind: "failed",
      failedStep: null,
      remainingState: "state-unknown",
      cause: "transport-failed",
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response(500, {}));
    expect(await requestUndoSplit(PID)).toMatchObject({
      kind: "failed",
      remainingState: "state-unknown",
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, { outcome: "bogus" }),
    );
    expect(await requestUndoSplit(PID)).toMatchObject({
      kind: "failed",
      remainingState: "state-unknown",
    });
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "split.requestUndoSplit",
      expect.anything(),
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        outcome: "failed",
        failedStep: "x",
        cause: "c",
        remainingState: "y",
      }),
    );
    expect(await requestUndoSplit(PID)).toMatchObject({
      kind: "failed",
      remainingState: "state-unknown",
    });
  });

  it("rethrows the locked error for 401 and 409, not a not-paired 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response(401, {}));
    await expect(requestUndoSplit(PID)).rejects.toBeInstanceOf(
      ProjectLockedError,
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response(409, {}));
    await expect(requestUndoSplit(PID)).rejects.toBeInstanceOf(
      MissingProjectKeyError,
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(401, {}, { "x-getwrite-gate": "not-paired" }),
    );
    expect(await requestUndoSplit(PID)).toMatchObject({ kind: "failed" });
  });

  it("does not send a bad project id", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await requestUndoSplit("../x")).toMatchObject({
      kind: "failed",
      remainingState: "split-restored",
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("the body parser accepts only the project id", () => {
    expect(parseSplitUndoBody({ projectId: PID })).toEqual({
      ok: true,
      value: { projectId: PID },
    });
    for (const bad of [
      null,
      [],
      {},
      { projectId: PID, path: "x" },
      { projectId: "x" },
    ])
      expect(parseSplitUndoBody(bad)).toEqual({ ok: false });
  });
});

describe("requestUndoSplit: the merge outcomes (Feature 121 Task 40)", () => {
  const MERGE_APPLIED_BODY = {
    outcome: "applied",
    operation: "merge",
    targetDocumentId: RID,
    targetName: "Chapter 1",
    absorbedDocumentIds: [NEW_ID, "88888888-8888-4888-8888-888888888888"],
    skippedDocuments: [],
    preservedRevisions: [
      {
        documentId: RID,
        revisionId: "9d2f4a6c-1b7e-4e08-a3c5-7e1d0b4f8a63",
        revisionNumber: 3,
      },
    ],
    movedAnnotationIds: ["a1"],
  };

  it("maps an applied merge to its own kind with the target's name and the number of absorbed documents", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, MERGE_APPLIED_BODY),
    );
    const result = await requestUndoSplit(PID);
    expect(result).toEqual({
      kind: "merge-applied",
      targetDocumentId: RID,
      targetName: "Chapter 1",
      absorbedCount: 2,
      absorbedDocumentIds: MERGE_APPLIED_BODY.absorbedDocumentIds,
      skippedDocuments: [],
      preservedRevisions: MERGE_APPLIED_BODY.preservedRevisions,
      movedAnnotationIds: ["a1"],
    });
  });

  it("carries a null target name as null", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, { ...MERGE_APPLIED_BODY, targetName: null }),
    );
    const result = await requestUndoSplit(PID);
    expect(result.kind).toBe("merge-applied");
    expect((result as { targetName: string | null }).targetName).toBeNull();
  });

  it("maps index-failed of a merge to a success kind carrying the failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        ...MERGE_APPLIED_BODY,
        outcome: "index-failed",
        failures: [{ documentId: RID, step: "inverted-index" }],
      }),
    );
    const result = await requestUndoSplit(PID);
    expect(result.kind).toBe("merge-index-failed");
    expect((result as { failures: unknown[] }).failures).toEqual([
      { documentId: RID, step: "inverted-index" },
    ]);
  });

  it("maps a merge refusal to its reason and the Undo merge text, not the server's text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        outcome: "refused",
        operation: "merge",
        reason: "target-in-trash",
        message: "SERVER TEXT",
        documentId: RID,
      }),
    );
    expect(await requestUndoSplit(PID)).toEqual({
      kind: "merge-refused",
      reason: "target-in-trash",
      message: MERGE_UNDO_REFUSAL_MESSAGES["target-in-trash"],
      documentId: RID,
    });
  });

  it("maps a failed merge Undo to the step and the state that remains", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        outcome: "failed",
        operation: "merge",
        failedStep: "clear-marks",
        cause: "Error",
        remainingState: "marks-not-restored",
      }),
    );
    expect(await requestUndoSplit(PID)).toEqual({
      kind: "merge-failed",
      failedStep: "clear-marks",
      remainingState: "marks-not-restored",
      cause: "Error",
    });
  });

  it("does not map an unsupported-operation body for a merge to a split kind: it is a check that did not complete", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, { outcome: "unsupported-operation", kind: "merge" }),
    );
    expect(await requestUndoSplit(PID)).toEqual({
      kind: "could-not-be-checked",
      cause: "unsupported-operation",
    });
  });

  it("maps a merge body with an unknown remaining state or step to failed with an unknown state and reports it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        outcome: "failed",
        operation: "merge",
        failedStep: "no-such-step",
        cause: "Error",
        remainingState: "merge-restored",
      }),
    );
    const result = await requestUndoSplit(PID);
    expect(result).toMatchObject({
      kind: "failed",
      remainingState: "state-unknown",
    });
  });

  it("still maps a split body as before", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, UNDO_APPLIED_FOR_MERGE_SUITE),
    );
    expect((await requestUndoSplit(PID)).kind).toBe("applied");
  });
});

const UNDO_APPLIED_FOR_MERGE_SUITE = {
  outcome: "applied",
  originalDocumentId: RID,
  splitOffDocumentId: NEW_ID,
  splitOffState: "moved-to-trash",
  preservedRevisions: [],
  movedAnnotationIds: [],
};

describe("requestLatestSplitOperation (Feature 120 Task 31)", () => {
  const RECORD = {
    kind: "split",
    affectedDocumentIds: [RID, NEW_ID],
    snapshotRevisions: [
      {
        documentId: RID,
        revisionId: "5b0c7f0e-8a3d-4c55-9d1e-2f6a1c9b7e42",
        revisionNumber: 2,
      },
    ],
    newDocumentId: NEW_ID,
    date: "2026-11-17T10:00:00.000Z",
  };

  it("GETs with only the project id in the query and returns the record", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response(200, { outcome: "found", record: RECORD }));
    expect(await requestLatestSplitOperation(PID)).toEqual({
      kind: "record",
      record: RECORD,
    });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(`/api/project/split/latest?projectId=${PID}`);
    expect(init?.method ?? "GET").toBe("GET");
  });

  it("returns none as none and a failed read as failed, never the same value", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, { outcome: "none" }),
    );
    expect(await requestLatestSplitOperation(PID)).toEqual({ kind: "none" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, { outcome: "failed", cause: "record-unreadable" }),
    );
    expect(await requestLatestSplitOperation(PID)).toEqual({
      kind: "failed",
      cause: "record-unreadable",
    });
  });

  it("maps a thrown fetch, a non-ok status and a malformed body to failed", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("net"));
    expect(await requestLatestSplitOperation(PID)).toEqual({
      kind: "failed",
      cause: "transport-failed",
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response(500, {}));
    expect(await requestLatestSplitOperation(PID)).toMatchObject({
      kind: "failed",
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, { outcome: "found", record: { kind: "split" } }),
    );
    expect(await requestLatestSplitOperation(PID)).toMatchObject({
      kind: "failed",
    });
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "split.requestLatestSplitOperation",
      expect.anything(),
    );
  });

  it("rethrows the locked error for 401 and 409", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response(401, {}));
    await expect(requestLatestSplitOperation(PID)).rejects.toBeInstanceOf(
      ProjectLockedError,
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response(409, {}));
    await expect(requestLatestSplitOperation(PID)).rejects.toBeInstanceOf(
      MissingProjectKeyError,
    );
  });

  it("does not send a bad project id; the query parser takes exactly one projectId", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await requestLatestSplitOperation("../x")).toMatchObject({
      kind: "failed",
    });
    expect(spy).not.toHaveBeenCalled();
    expect(
      parseSplitLatestQuery(new URLSearchParams(`projectId=${PID}`)),
    ).toEqual({ ok: true, value: { projectId: PID } });
    for (const q of [
      "",
      `projectId=${PID}&x=1`,
      `projectId=${PID}&projectId=${PID}`,
      "projectId=x",
    ])
      expect(parseSplitLatestQuery(new URLSearchParams(q))).toEqual({
        ok: false,
      });
  });
});

describe("requestSplitPreview", () => {
  it("posts only the validated fields and returns the preview", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response(200, PREVIEW_BODY));
    const result = await requestSplitPreview(PID, {
      ...PREVIEW_REQUEST,
      path: "/etc/passwd",
    } as never);
    expect(result).toEqual({ kind: "preview", preview: PREVIEW_BODY });
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe("/api/project/split/preview");
    expect(init?.method).toBe("POST");
    expect(sentBody(init)).toEqual({ projectId: PID, ...PREVIEW_REQUEST });
  });

  it("maps the stale-cursor refusal to stale, with the stale text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        outcome: "refused",
        reason: SPLIT_REFUSAL_REASONS.staleCursor,
      }),
    );
    expect(await requestSplitPreview(PID, PREVIEW_REQUEST)).toEqual({
      kind: "stale",
      message: SPLIT_REFUSAL_MESSAGES[SPLIT_REFUSAL_REASONS.staleCursor],
    });
  });

  it("maps another refusal to refused with its reason and text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        outcome: "refused",
        reason: SPLIT_REFUSAL_REASONS.cursorInTableCell,
      }),
    );
    expect(await requestSplitPreview(PID, PREVIEW_REQUEST)).toEqual({
      kind: "refused",
      reason: SPLIT_REFUSAL_REASONS.cursorInTableCell,
      message: SPLIT_REFUSAL_MESSAGES[SPLIT_REFUSAL_REASONS.cursorInTableCell],
    });
  });

  it("maps a server failed outcome to failed, never to a preview", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, { outcome: "failed", cause: "content-unreadable" }),
    );
    expect(await requestSplitPreview(PID, PREVIEW_REQUEST)).toEqual({
      kind: "failed",
      message: SPLIT_TRANSPORT_FAILED_MESSAGE,
    });
  });

  it("maps a thrown fetch to failed", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("net"));
    expect(await requestSplitPreview(PID, PREVIEW_REQUEST)).toEqual({
      kind: "failed",
      message: SPLIT_TRANSPORT_FAILED_MESSAGE,
    });
  });

  it.each([400, 403, 404, 500])("maps HTTP %i to failed", async (status) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(status, { error: "SECRET-server-text" }),
    );
    const result = await requestSplitPreview(PID, PREVIEW_REQUEST);
    expect(result.kind).toBe("failed");
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  it("maps a malformed 200 body to failed and reports it without the body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, { outcome: "preview", firstHalfWords: "many" }),
    );
    expect((await requestSplitPreview(PID, PREVIEW_REQUEST)).kind).toBe(
      "failed",
    );
    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reportTransportValidationFailure).mock.calls[0][0]).toBe(
      "split.requestSplitPreview",
    );
  });

  it("maps a non-JSON 200 body to failed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html>", { status: 200 }),
    );
    expect((await requestSplitPreview(PID, PREVIEW_REQUEST)).kind).toBe(
      "failed",
    );
  });

  it("rethrows the locked error for 401 and 409", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      response(401, { error: "locked" }),
    );
    await expect(
      requestSplitPreview(PID, PREVIEW_REQUEST),
    ).rejects.toBeInstanceOf(ProjectLockedError);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      response(409, { error: "no key" }),
    );
    const err = await requestSplitPreview(PID, PREVIEW_REQUEST).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(MissingProjectKeyError);
    expect(isLockedAccessError(err)).toBe(true);
  });

  it("does not treat a not-paired 401 as a locked project", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(401, { error: "x" }, { "x-getwrite-gate": "not-paired" }),
    );
    expect((await requestSplitPreview(PID, PREVIEW_REQUEST)).kind).toBe(
      "failed",
    );
  });

  it.each([
    ["a bad project id", "../x", PREVIEW_REQUEST],
    ["a bad resource id", PID, { ...PREVIEW_REQUEST, resourceId: "../x" }],
    ["a bad hash", PID, { ...PREVIEW_REQUEST, contentHash: "zz" }],
    ["a negative offset", PID, { ...PREVIEW_REQUEST, offset: -1 }],
    ["a fractional offset", PID, { ...PREVIEW_REQUEST, offset: 1.5 }],
    ["an empty revision id", PID, { ...PREVIEW_REQUEST, revisionId: "" }],
    [
      "a folder-name style revision id",
      PID,
      { ...PREVIEW_REQUEST, revisionId: "v-1" },
    ],
  ])("does not send %s and reports it as failed", async (_n, pid, req) => {
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await requestSplitPreview(pid, req);
    expect(result).toEqual({
      kind: "failed",
      message: SPLIT_INVALID_REQUEST_MESSAGE,
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("requestSplit", () => {
  it("posts only the validated fields and returns applied", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response(200, APPLIED));
    const result = await requestSplit(PID, {
      ...APPLY_REQUEST,
      projectRoot: "/x",
      carryOver: { ...APPLY_REQUEST.carryOver, extra: 1 },
    } as never);
    expect(result).toEqual({
      kind: "applied",
      newDocumentId: NEW_ID,
      notices: [],
      snapshotRevisionId: "5b0c7f0e-8a3d-4c55-9d1e-2f6a1c9b7e42",
      snapshotRevisionNumber: 2,
    });
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe("/api/project/split");
    expect(sentBody(init)).toEqual({ projectId: PID, ...APPLY_REQUEST });
  });

  it("carries the notice texts of an applied split", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, { ...APPLIED, notices: ["notice text"] }),
    );
    const result = await requestSplit(PID, APPLY_REQUEST);
    expect(result.kind === "applied" && result.notices).toEqual([
      "notice text",
    ]);
  });

  it("maps index-failed to success with a notice, not to failed", async () => {
    const failures = [{ documentId: NEW_ID, step: "inverted-index" }];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        ...APPLIED,
        outcome: "index-failed",
        failures,
        message: "server text",
      }),
    );
    const result = await requestSplit(PID, APPLY_REQUEST);
    expect(result).toEqual({
      kind: "index-failed",
      newDocumentId: NEW_ID,
      notices: [],
      snapshotRevisionId: "5b0c7f0e-8a3d-4c55-9d1e-2f6a1c9b7e42",
      snapshotRevisionNumber: 2,
      failures,
      message: describeSplitIndexFailure(["inverted-index"]),
    });
  });

  it("maps the stale refusal to stale and any other refusal to refused", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      response(200, {
        outcome: "refused",
        reason: SPLIT_REFUSAL_REASONS.staleCursor,
      }),
    );
    expect((await requestSplit(PID, APPLY_REQUEST)).kind).toBe("stale");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      response(200, {
        outcome: "refused",
        reason: SPLIT_REFUSAL_REASONS.mergedDocument,
      }),
    );
    expect(await requestSplit(PID, APPLY_REQUEST)).toEqual({
      kind: "refused",
      reason: SPLIT_REFUSAL_REASONS.mergedDocument,
      message: SPLIT_REFUSAL_MESSAGES[SPLIT_REFUSAL_REASONS.mergedDocument],
    });
  });

  it("maps failed to the state that remains, in the failure text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        outcome: "failed",
        failedStep: "truncate",
        remainingState: "original-truncated",
        cause: "Error",
      }),
    );
    expect(await requestSplit(PID, APPLY_REQUEST)).toEqual({
      kind: "failed",
      failedStep: "truncate",
      remainingState: "original-truncated",
      message: describeSplitFailure("truncate", "original-truncated"),
    });
  });

  it("maps a thrown fetch to failed with an unknown state, never to no result", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("net"));
    expect(await requestSplit(PID, APPLY_REQUEST)).toEqual({
      kind: "failed",
      failedStep: null,
      remainingState: "state-unknown",
      message: SPLIT_TRANSPORT_STATE_UNKNOWN_MESSAGE,
    });
  });

  it("maps a non-ok response and a malformed body to failed with an unknown state", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      response(500, { error: "SECRET" }),
    );
    const server = await requestSplit(PID, APPLY_REQUEST);
    expect(server.kind).toBe("failed");
    expect(JSON.stringify(server)).not.toContain("SECRET");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      response(200, { outcome: "applied" }),
    );
    const malformed = await requestSplit(PID, APPLY_REQUEST);
    expect(malformed).toMatchObject({
      kind: "failed",
      remainingState: "state-unknown",
    });
    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
  });

  it("rethrows the locked error and never returns it as a result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response(401, {}));
    await expect(requestSplit(PID, APPLY_REQUEST)).rejects.toBeInstanceOf(
      ProjectLockedError,
    );
  });

  it.each([
    ["a bad project id", "x", APPLY_REQUEST],
    [
      "annotation ids that are not strings",
      PID,
      {
        ...APPLY_REQUEST,
        carryOver: { ...APPLY_REQUEST.carryOver, annotationIds: [1] },
      },
    ],
    [
      "fields that are not an array",
      PID,
      {
        ...APPLY_REQUEST,
        carryOver: { ...APPLY_REQUEST.carryOver, fields: "a" },
      },
    ],
    [
      "a name that is not a string",
      PID,
      {
        ...APPLY_REQUEST,
        carryOver: { ...APPLY_REQUEST.carryOver, newName: 3 },
      },
    ],
    ["no carry-over", PID, PREVIEW_REQUEST],
  ])("does not send %s", async (_n, pid, req) => {
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await requestSplit(pid, req as never);
    expect(result).toMatchObject({ kind: "failed" });
    expect(spy).not.toHaveBeenCalled();
  });
});
