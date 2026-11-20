/**
 * Feature 121, Task 17: pure eligibility decision for "Merge documents"
 * (FR-2). One stable reason per refusal, naming the document that caused it.
 */
import { describe, expect, it } from "vitest";
import {
  mergeEligibility,
  type MergeEligibilityDocument,
} from "../../src/lib/models/merge-eligibility";
import {
  MERGE_REFUSAL_REASONS,
  MERGED_MARK_SIDECAR_KEY,
  type MergedMark,
} from "../../src/lib/models/merge-types";

const text = (
  id: string,
  extra: Record<string, unknown> = {},
): MergeEligibilityDocument => ({
  id,
  sidecar: { type: "text", ...extra },
  inTrash: false,
});
const typed = (id: string, type: string): MergeEligibilityDocument => ({
  id,
  sidecar: { type },
  inTrash: false,
});
const refused = (reason: string, documentId: string | null) => ({
  eligible: false,
  reason,
  documentId,
});
const mark: MergedMark = {
  targetDocumentId: "t",
  targetSnapshotRevisionId: "rev",
  date: "2026-01-01T00:00:00.000Z",
};

describe("mergeEligibility", () => {
  it("allows two eligible documents", () => {
    expect(mergeEligibility([text("a"), text("b")])).toEqual({
      eligible: true,
    });
  });

  it("allows a cross-folder selection of eligible documents", () => {
    const docs = [
      text("a", { folderId: "f1" }),
      text("b", { folderId: "f2" }),
      text("c"),
    ];
    expect(mergeEligibility(docs)).toEqual({ eligible: true });
  });

  it("refuses no documents and one document", () => {
    expect(mergeEligibility([])).toEqual(
      refused(MERGE_REFUSAL_REASONS.fewerThanTwo, null),
    );
    expect(mergeEligibility([text("a")])).toEqual(
      refused(MERGE_REFUSAL_REASONS.fewerThanTwo, null),
    );
  });

  it("refuses a repeated id, naming it", () => {
    expect(mergeEligibility([text("a"), text("b"), text("a")])).toEqual(
      refused(MERGE_REFUSAL_REASONS.repeatedId, "a"),
    );
  });

  it("refuses the whole selection for a folder, naming the folder", () => {
    expect(
      mergeEligibility([text("a"), typed("f", "folder"), text("b")]),
    ).toEqual(refused(MERGE_REFUSAL_REASONS.folder, "f"));
  });

  it("never drops a folder row: a folder plus one document is refused as a folder", () => {
    expect(mergeEligibility([text("a"), typed("f", "folder")])).toEqual(
      refused(MERGE_REFUSAL_REASONS.folder, "f"),
    );
  });

  it("refuses an image", () => {
    expect(mergeEligibility([text("a"), typed("i", "image")])).toEqual(
      refused(MERGE_REFUSAL_REASONS.mediaResource, "i"),
    );
  });

  it("refuses an audio resource", () => {
    expect(mergeEligibility([typed("au", "audio"), text("a")])).toEqual(
      refused(MERGE_REFUSAL_REASONS.mediaResource, "au"),
    );
  });

  it("refuses a Source", () => {
    expect(mergeEligibility([text("a"), typed("s", "source")])).toEqual(
      refused(MERGE_REFUSAL_REASONS.source, "s"),
    );
  });

  it("refuses an entity document", () => {
    expect(
      mergeEligibility([text("a"), text("e", { entityKind: "character" })]),
    ).toEqual(refused(MERGE_REFUSAL_REASONS.entityDocument, "e"));
  });

  it("refuses a marked document as the target with merged-target", () => {
    expect(
      mergeEligibility([
        text("m", { [MERGED_MARK_SIDECAR_KEY]: mark }),
        text("b"),
      ]),
    ).toEqual(refused(MERGE_REFUSAL_REASONS.mergedTarget, "m"));
  });

  it("refuses a marked document as an absorbed document with merged-absorbed", () => {
    expect(
      mergeEligibility([
        text("a"),
        text("m", { [MERGED_MARK_SIDECAR_KEY]: mark }),
      ]),
    ).toEqual(refused(MERGE_REFUSAL_REASONS.mergedAbsorbed, "m"));
  });

  it("refuses a missing document", () => {
    expect(
      mergeEligibility([text("a"), { id: "x", sidecar: null, inTrash: false }]),
    ).toEqual(refused(MERGE_REFUSAL_REASONS.missingDocument, "x"));
  });

  it("refuses a document in Trash", () => {
    expect(
      mergeEligibility([
        text("a"),
        { id: "t1", sidecar: { type: "text" }, inTrash: true },
      ]),
    ).toEqual(refused(MERGE_REFUSAL_REASONS.documentInTrash, "t1"));
  });

  it("refuses the whole selection when any one document is refused", () => {
    const docs = [
      text("a"),
      text("b"),
      text("c"),
      text("e", { entityKind: "place" }),
    ];
    expect(mergeEligibility(docs)).toEqual(
      refused(MERGE_REFUSAL_REASONS.entityDocument, "e"),
    );
  });

  it("allows a split-off document", () => {
    expect(
      mergeEligibility([text("split-off", { folderId: "f" }), text("b")]),
    ).toEqual({ eligible: true });
  });

  it("allows a past target of an earlier merge (no mark on it)", () => {
    expect(
      mergeEligibility([text("past-target", { wordCount: 900 }), text("b")]),
    ).toEqual({ eligible: true });
  });

  it("allows the first document of an earlier split", () => {
    expect(
      mergeEligibility([text("split-first", { wordCount: 40 }), text("b")]),
    ).toEqual({ eligible: true });
  });

  it("reads the mark key through the seam: a substituted key changes the verdict", () => {
    const docs = [text("a"), text("m", { otherKey: mark })];
    expect(mergeEligibility(docs)).toEqual({ eligible: true });
    expect(mergeEligibility(docs, "otherKey")).toEqual(
      refused(MERGE_REFUSAL_REASONS.mergedAbsorbed, "m"),
    );
    const marked = [text("a"), text("m", { [MERGED_MARK_SIDECAR_KEY]: mark })];
    expect(mergeEligibility(marked, "otherKey")).toEqual({ eligible: true });
  });
});
