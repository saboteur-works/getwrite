/**
 * Feature 121 (Task 28, FR-17): the merged-away rule for compile, as a
 * read-time filter over the resources before the compile tree is built.
 *
 * Not shown here: the dialogs (tests/component/MergeRuleCompile.test.tsx).
 */
import { describe, expect, it, vi } from "vitest";

const predicate = vi.hoisted(() => ({ calls: 0 }));

vi.mock("../../src/lib/models/split-eligibility", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/lib/models/split-eligibility")
    >();
  return {
    ...actual,
    isMergedDocument: (...args: Parameters<typeof actual.isMergedDocument>) => {
      predicate.calls += 1;
      return actual.isMergedDocument(...args);
    },
  };
});

import {
  buildCompileTree,
  excludeMergedDocuments,
  initAllChecked,
  orderResourceIdsByTreePosition,
} from "../../components/common/compileSelection";
import { createTextResource } from "../../src/lib/models/resource";
import type { AnyResource } from "../../src/lib/models/types";

const MARK = {
  targetId: "target",
  snapshotRevisionId: "rev-1",
  date: "2026-11-15",
};

function doc(id: string, extra: Record<string, unknown> = {}): AnyResource {
  const res = createTextResource({ name: id });
  Object.assign(res, { id }, extra);
  return res;
}

describe("excludeMergedDocuments (FR-17)", () => {
  it("drops a document that carries the merged mark and keeps the rest in order", () => {
    const resources = [doc("a"), doc("b", { mergedMark: MARK }), doc("c")];
    expect(excludeMergedDocuments(resources).map((r) => r.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("returns every resource when none is marked", () => {
    const resources = [doc("a"), doc("c")];
    expect(excludeMergedDocuments(resources)).toEqual(resources);
  });

  it("reads the one isMergedDocument predicate", () => {
    predicate.calls = 0;
    excludeMergedDocuments([doc("a"), doc("b", { mergedMark: MARK })]);
    expect(predicate.calls).toBe(2);
  });

  it("does not modify its input", () => {
    const resources = [doc("a"), doc("b", { mergedMark: MARK })];
    const snapshot = JSON.stringify(resources);
    excludeMergedDocuments(resources);
    expect(JSON.stringify(resources)).toBe(snapshot);
  });

  it("keeps a marked document out of the compile tree and the entity ordering", () => {
    const resources = [doc("a"), doc("b", { mergedMark: MARK })];
    const visible = excludeMergedDocuments(resources);
    expect([...initAllChecked(buildCompileTree(visible))]).toEqual(["a"]);
    expect(orderResourceIdsByTreePosition(visible, ["a", "b"])).toEqual(["a"]);
  });

  it("follows the mark through Trash, restore and the mark's removal with no write", () => {
    // In Trash: the document is not in the resource list at all.
    expect(excludeMergedDocuments([doc("a")]).map((r) => r.id)).toEqual(["a"]);
    // Restored with its mark: still excluded.
    expect(
      excludeMergedDocuments([doc("a"), doc("b", { mergedMark: MARK })]).map(
        (r) => r.id,
      ),
    ).toEqual(["a"]);
    // The mark's key gone: listed again, derived only.
    expect(
      excludeMergedDocuments([doc("a"), doc("b")]).map((r) => r.id),
    ).toEqual(["a", "b"]);
  });
});
