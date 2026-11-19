import { describe, it, expect } from "vitest";
import { computeStatusRollup } from "../../src/lib/status-rollup";
import { MERGED_MARK_SIDECAR_KEY } from "../../src/lib/models/merge-types";
import type { AnyResource } from "../../src/lib/models/types";

const MARK = {
  targetId: "target",
  snapshotRevisionId: "rev-opaque",
  date: "2026-11-15T00:00:00.000Z",
};

function doc(
  id: string,
  words: number,
  options: { marked?: boolean; status?: string } = {},
): AnyResource {
  return {
    id,
    name: id,
    type: "text",
    createdAt: "2026-01-01T00:00:00.000Z",
    wordCount: words,
    userMetadata: options.status ? { status: options.status } : {},
    ...(options.marked ? { [MERGED_MARK_SIDECAR_KEY]: MARK } : {}),
  } as unknown as AnyResource;
}

describe("Feature 121 FR-20: status roll-up skips a merged-away document's words", () => {
  it("leaves the marked document's words out of its status row", () => {
    const rows = computeStatusRollup(
      [
        doc("target", 150, { status: "draft" }),
        doc("absorbed", 100, { status: "draft", marked: true }),
      ],
      ["draft"],
    );
    expect(rows.find((r) => r.label === "draft")?.words).toBe(150);
  });

  it("leaves the marked document's words out of the No status row", () => {
    const rows = computeStatusRollup(
      [doc("a", 10), doc("b", 99, { marked: true })],
      [],
    );
    expect(rows.find((r) => r.kind === "unset")?.words).toBe(10);
  });

  it("is unchanged for documents without the mark", () => {
    const rows = computeStatusRollup(
      [doc("a", 10, { status: "draft" }), doc("b", 5, { status: "draft" })],
      ["draft"],
    );
    expect(rows[0]).toMatchObject({ resourceCount: 2, words: 15 });
  });

  it("does not alter the stored wordCount of the marked document", () => {
    const marked = doc("absorbed", 100, { marked: true });
    computeStatusRollup([marked], []);
    expect((marked as unknown as { wordCount: number }).wordCount).toBe(100);
  });

  it("counts the target's figure after the merge, which includes the appended text", () => {
    const rows = computeStatusRollup(
      [
        doc("target", 100 + 40, { status: "draft" }),
        doc("absorbed", 40, { status: "draft", marked: true }),
      ],
      ["draft"],
    );
    expect(rows.find((r) => r.label === "draft")?.words).toBe(140);
  });
});
