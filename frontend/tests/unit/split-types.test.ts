/**
 * Feature 120, Task 9: the inert split contract. Constants and types only;
 * these tests pin the reason codes, the merged-mark key name, the five lineage
 * states and the shape of the result unions.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLIENT_WRITABLE_SIDECAR_KEYS } from "../../src/lib/models/resource-crud-core";
import {
  MERGED_MARK_SIDECAR_KEY,
  SPLIT_LINEAGE_STATES,
  SPLIT_OPERATION_KINDS,
  SPLIT_OUTCOMES,
  SPLIT_REFUSAL_REASONS,
  SPLIT_STEPS,
  type LatestOperationRecord,
  type SplitCarryOverChoice,
  type SplitEligibilityResult,
  type SplitLineageRecord,
  type SplitLineageStateResult,
  type SplitResult,
} from "../../src/lib/models/split-types";

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
  it("has one distinct stable string for each FR-2 refusal", () => {
    expect(SPLIT_REFUSAL_REASONS.mediaResource).toBe("media-resource");
    expect(SPLIT_REFUSAL_REASONS.folder).toBe("folder");
    expect(SPLIT_REFUSAL_REASONS.source).toBe("source");
    expect(SPLIT_REFUSAL_REASONS.entityDocument).toBe("entity-document");
    expect(SPLIT_REFUSAL_REASONS.mergedDocument).toBe("merged-document");
    expect(SPLIT_REFUSAL_REASONS.cursorInTableCell).toBe(
      "cursor-in-table-cell",
    );
    expect(SPLIT_REFUSAL_REASONS.cursorInCodeBlock).toBe(
      "cursor-in-code-block",
    );
    expect(SPLIT_REFUSAL_REASONS.emptyFirstHalf).toBe("empty-first-half");
    expect(SPLIT_REFUSAL_REASONS.emptySecondHalf).toBe("empty-second-half");
  });

  it("has the FR-6, FR-7 and FR-14 refusals", () => {
    expect(SPLIT_REFUSAL_REASONS.staleCursor).toBe("stale-cursor");
    expect(SPLIT_REFUSAL_REASONS.lockedProject).toBe("locked-project");
    expect(SPLIT_REFUSAL_REASONS.stepFailed).toBe("step-failed");
  });

  it("shares no value between two reasons", () => {
    const values = Object.values(SPLIT_REFUSAL_REASONS);
    expect(values).toHaveLength(12);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("merged-mark key", () => {
  it("is a non-empty string", () => {
    expect(typeof MERGED_MARK_SIDECAR_KEY).toBe("string");
    expect(MERGED_MARK_SIDECAR_KEY.length).toBeGreaterThan(0);
  });

  it("is outside the client sidecar allowlist", () => {
    expect(CLIENT_WRITABLE_SIDECAR_KEYS).not.toContain(MERGED_MARK_SIDECAR_KEY);
  });

  it("is outside SIDECAR_CLEARABLE_KEYS", () => {
    const clearable = clearableKeysFromSource();
    expect(clearable.length).toBeGreaterThan(0);
    expect(clearable).not.toContain(MERGED_MARK_SIDECAR_KEY);
  });
});

describe("lineage states (FR-15)", () => {
  it("are exactly the five stated states, each distinct", () => {
    expect([...SPLIT_LINEAGE_STATES]).toEqual([
      "available",
      "revision-no-longer-kept",
      "document-in-trash",
      "document-permanently-removed",
      "could-not-be-checked",
    ]);
  });
});

describe("operation kinds and steps", () => {
  it("names split and merge", () => {
    expect([...SPLIT_OPERATION_KINDS]).toEqual(["split", "merge"]);
  });

  it("lists the FR-6 write steps in order", () => {
    expect([...SPLIT_STEPS]).toEqual([
      "lock-original",
      "snapshot",
      "create-document",
      "move-annotations",
      "seed-exclusion",
      "truncate",
      "write-records",
    ]);
  });
});

describe("record shapes", () => {
  it("accepts a lineage record", () => {
    const record: SplitLineageRecord = {
      sourceDocumentId: "doc-1",
      sourceRevisionId: "rev-1",
      sourceRevisionNumber: 3,
      operation: "split",
      date: "2026-11-16T00:00:00.000Z",
    };
    expect(record.operation).toBe("split");
  });

  it("accepts a latest-operation record", () => {
    const record: LatestOperationRecord = {
      kind: "split",
      affectedDocumentIds: ["doc-1", "doc-2"],
      snapshotRevisions: [
        { documentId: "doc-1", revisionId: "rev-1", revisionNumber: 3 },
      ],
      newDocumentId: "doc-2",
      date: "2026-11-16T00:00:00.000Z",
    };
    expect(record.kind).toBe("split");
  });

  it("accepts a carry-over choice", () => {
    const choice: SplitCarryOverChoice = {
      annotationIds: ["a1"],
      fields: ["status"],
      newName: "Part two",
    };
    expect(choice.fields).toEqual(["status"]);
  });
});

describe("result unions", () => {
  it("gives each outcome its own value", () => {
    expect(SPLIT_OUTCOMES.applied).toBe("applied");
    expect(SPLIT_OUTCOMES.refused).toBe("refused");
    expect(SPLIT_OUTCOMES.failed).toBe("failed");
    expect(new Set(Object.values(SPLIT_OUTCOMES)).size).toBe(3);
  });

  it("narrows a failed split to the state that remains, never to an applied one", () => {
    const result: SplitResult = {
      outcome: "failed",
      failedStep: "truncate",
      remainingState: "original-restored",
    };
    if (result.outcome === "failed") {
      expect(result.remainingState).toBe("original-restored");
    } else {
      throw new Error("expected failed");
    }
  });

  it("separates a refusal from an eligible result", () => {
    const yes: SplitEligibilityResult = { eligible: true };
    const no: SplitEligibilityResult = {
      eligible: false,
      reason: SPLIT_REFUSAL_REASONS.folder,
    };
    expect(yes).not.toEqual(no);
  });

  it("keeps could-not-be-checked apart from every other lineage state", () => {
    const failed: SplitLineageStateResult = {
      state: "could-not-be-checked",
      cause: "read failed",
    };
    const gone: SplitLineageStateResult = {
      state: "document-permanently-removed",
    };
    expect(failed.state).not.toBe(gone.state);
  });
});
