/**
 * Feature 121, Task 15: the inert merge contract. Constants and types only;
 * these tests pin the reason codes, the merged-mark shape and its key, the
 * carry-over choice and the shape of the result unions.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLIENT_WRITABLE_SIDECAR_KEYS } from "../../src/lib/models/resource-crud-core";
import {
  MERGED_MARK_SIDECAR_KEY,
  MERGE_MARK_STATES,
  MERGE_OUTCOMES,
  MERGE_REFUSAL_REASONS,
  MERGE_STEPS,
  type MergeCarryOverChoice,
  type MergeEligibilityResult,
  type MergeMarkStateResult,
  type MergedMark,
  type MergeResult,
} from "../../src/lib/models/merge-types";

const FRONTEND_ROOT = path.resolve(__dirname, "../..");

/** The `SIDECAR_CLEARABLE_KEYS` literal, read from source (it is not exported). */
function clearableKeysFromSource(): string[] {
  const source = readFileSync(
    path.join(FRONTEND_ROOT, "src/lib/models/resource-crud-core.ts"),
    "utf8",
  );
  const match =
    /const SIDECAR_CLEARABLE_KEYS: readonly string\[\] = \[([^\]]*)\]/.exec(
      source,
    );
  if (!match) throw new Error("SIDECAR_CLEARABLE_KEYS literal not found");
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("refusal reasons", () => {
  it("has one stable string for each FR-2 refusal", () => {
    expect(MERGE_REFUSAL_REASONS.fewerThanTwo).toBe("fewer-than-two-documents");
    expect(MERGE_REFUSAL_REASONS.repeatedId).toBe("repeated-id");
    expect(MERGE_REFUSAL_REASONS.folder).toBe("folder");
    expect(MERGE_REFUSAL_REASONS.mediaResource).toBe("media-resource");
    expect(MERGE_REFUSAL_REASONS.source).toBe("source");
    expect(MERGE_REFUSAL_REASONS.entityDocument).toBe("entity-document");
    expect(MERGE_REFUSAL_REASONS.mergedTarget).toBe("merged-target");
    expect(MERGE_REFUSAL_REASONS.mergedAbsorbed).toBe("merged-absorbed");
    expect(MERGE_REFUSAL_REASONS.missingDocument).toBe("missing-document");
    expect(MERGE_REFUSAL_REASONS.documentInTrash).toBe("document-in-trash");
  });

  it("has the FR-6, FR-7, FR-9 and FR-15 refusals", () => {
    expect(MERGE_REFUSAL_REASONS.staleContent).toBe("stale-content");
    expect(MERGE_REFUSAL_REASONS.annotationLimit).toBe("annotation-limit");
    expect(MERGE_REFUSAL_REASONS.tooManyDocuments).toBe("too-many-documents");
    expect(MERGE_REFUSAL_REASONS.lockedProject).toBe("locked-project");
    expect(MERGE_REFUSAL_REASONS.stepFailed).toBe("step-failed");
  });

  it("shares no value between two reasons", () => {
    const values = Object.values(MERGE_REFUSAL_REASONS);
    expect(values).toHaveLength(15);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("merged mark", () => {
  it("keeps the existing key name", () => {
    expect(MERGED_MARK_SIDECAR_KEY).toBe("mergedMark");
  });

  it("is outside the client sidecar allowlist", () => {
    expect(CLIENT_WRITABLE_SIDECAR_KEYS).not.toContain(MERGED_MARK_SIDECAR_KEY);
  });

  it("is outside SIDECAR_CLEARABLE_KEYS", () => {
    const clearable = clearableKeysFromSource();
    expect(clearable.length).toBeGreaterThan(0);
    expect(clearable).not.toContain(MERGED_MARK_SIDECAR_KEY);
  });

  it("holds the target id, the target snapshot revision id and the date", () => {
    const mark: MergedMark = {
      targetDocumentId: "doc-1",
      targetSnapshotRevisionId: "rev-1",
      date: "2026-11-18T00:00:00.000Z",
    };
    expect(Object.keys(mark).sort()).toEqual([
      "date",
      "targetDocumentId",
      "targetSnapshotRevisionId",
    ]);
  });

  it("names the live state and the four states beyond it", () => {
    expect([...MERGE_MARK_STATES]).toEqual([
      "available",
      "revision-no-longer-kept",
      "target-in-trash",
      "target-permanently-removed",
      "could-not-be-checked",
    ]);
  });
});

describe("steps and outcomes", () => {
  it("lists the FR-6 write steps in order", () => {
    expect([...MERGE_STEPS]).toEqual([
      "lock-documents",
      "snapshot",
      "move-annotations",
      "write-marks",
      "strip-absorbed-marks",
      "append-to-target",
      "write-records",
    ]);
  });

  it("gives each outcome its own value", () => {
    expect(new Set(Object.values(MERGE_OUTCOMES)).size).toBe(3);
  });
});

describe("carry-over choice", () => {
  it("holds annotation ids, a per-field source document or none, and united multiselects", () => {
    const choice: MergeCarryOverChoice = {
      annotationIds: ["a1"],
      fields: [
        { field: "status", sourceDocumentId: "doc-2" },
        { field: "pov", sourceDocumentId: null },
      ],
      unitedMultiselectFields: ["tags"],
    };
    expect(choice.fields[1].sourceDocumentId).toBeNull();
  });
});

describe("result unions", () => {
  it("narrows a failed merge to the state that remains, never to an applied one", () => {
    const result: MergeResult = {
      outcome: "failed",
      failedStep: "append-to-target",
      remainingState: "documents-restored",
    };
    if (result.outcome === "failed") {
      expect(result.remainingState).toBe("documents-restored");
    } else {
      throw new Error("expected failed");
    }
  });

  it("names the document that caused a refusal", () => {
    const no: MergeEligibilityResult = {
      eligible: false,
      reason: MERGE_REFUSAL_REASONS.folder,
      documentId: "folder-1",
    };
    const yes: MergeEligibilityResult = { eligible: true };
    expect(yes).not.toEqual(no);
    if (!no.eligible) expect(no.documentId).toBe("folder-1");
  });

  it("keeps could-not-be-checked apart from every other mark state", () => {
    const failed: MergeMarkStateResult = {
      state: "could-not-be-checked",
      cause: "read failed",
    };
    const gone: MergeMarkStateResult = { state: "target-permanently-removed" };
    expect(failed.state).not.toBe(gone.state);
  });
});
