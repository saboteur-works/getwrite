/**
 * Feature 110, Task 6 (FR-4, FR-6): the pure narrative scope. Each rule of
 * FR-6 is pinned by its own test.
 */
import { describe, expect, it } from "vitest";
import {
  listNarrativeFolders,
  resolveNarrativeScope,
  type FolderSubtypeRead,
} from "../../src/lib/models/folklore-narratives";
import type { AnyResource } from "../../src/lib/models/types";

function folder(
  id: string,
  parentId: string | null,
  orderIndex = 0,
): AnyResource {
  return {
    id,
    slug: id,
    name: id,
    type: "folder",
    parentId,
    orderIndex,
  } as AnyResource;
}

function res(
  id: string,
  type: "source" | "text" | "image" | "audio",
  folderId: string | null,
  orderIndex = 0,
  resourceSubtype?: string,
): AnyResource {
  return {
    id,
    slug: id,
    name: id,
    type,
    folderId,
    orderIndex,
    ...(resourceSubtype ? { resourceSubtype } : {}),
  } as AnyResource;
}

const ok = (subtype: string | null): FolderSubtypeRead => ({
  kind: "ok",
  subtype,
});

function subtypes(
  entries: Record<string, FolderSubtypeRead>,
): Map<string, FolderSubtypeRead> {
  return new Map(Object.entries(entries));
}

function ids(result: ReturnType<typeof resolveNarrativeScope>): string[] {
  if (result.kind !== "scope") throw new Error(`not a scope: ${result.kind}`);
  return result.variants.map((v) => v.resource.id);
}

describe("resolveNarrativeScope", () => {
  it("returns Sources of the folder and subfolders flattened in tree order", () => {
    const all = [
      res("s3", "source", "N", 3),
      folder("N", null),
      folder("sub", "N", 2),
      res("s1", "source", "N", 1),
      res("s2", "source", "sub", 0),
      res("s4", "source", "sub", 5),
    ];
    const subs = subtypes({ N: ok("Narrative"), sub: ok(null) });
    // N children by orderIndex: s1(1), sub(2), s3(3); sub: s2, s4.
    expect(ids(resolveNarrativeScope("N", all, subs))).toEqual([
      "s1",
      "s2",
      "s4",
      "s3",
    ]);
  });

  it("treats a nested Narrative folder as its own narrative and ends the parent's scope", () => {
    const all = [
      folder("N", null),
      folder("inner", "N", 1),
      res("a", "source", "N", 0),
      res("b", "source", "inner", 0),
      folder("deeper", "inner", 1),
      res("c", "source", "deeper", 0),
    ];
    const subs = subtypes({
      N: ok("Narrative"),
      inner: ok(" narrative "),
      deeper: ok(null),
    });
    expect(ids(resolveNarrativeScope("N", all, subs))).toEqual(["a"]);
    expect(ids(resolveNarrativeScope("inner", all, subs))).toEqual(["b", "c"]);
  });

  it("puts a Source in exactly one narrative", () => {
    const all = [
      folder("N", null),
      folder("inner", "N"),
      res("a", "source", "N"),
      res("b", "source", "inner"),
    ];
    const subs = subtypes({ N: ok("Narrative"), inner: ok("Narrative") });
    const seen = ["N", "inner"].flatMap((id) =>
      ids(resolveNarrativeScope(id, all, subs)),
    );
    expect(seen.sort()).toEqual(["a", "b"]);
  });

  it("does not list text, image or audio resources", () => {
    const all = [
      folder("N", null),
      res("t", "text", "N"),
      res("i", "image", "N"),
      res("au", "audio", "N"),
      res("s", "source", "N"),
    ];
    expect(
      ids(resolveNarrativeScope("N", all, subtypes({ N: ok("Narrative") }))),
    ).toEqual(["s"]);
  });

  it("drops a Source moved out of the narrative", () => {
    const subs = subtypes({ N: ok("Narrative"), other: ok(null) });
    const before = [
      folder("N", null),
      folder("other", null),
      res("s", "source", "N"),
    ];
    const after = [
      folder("N", null),
      folder("other", null),
      res("s", "source", "other"),
    ];
    expect(ids(resolveNarrativeScope("N", before, subs))).toEqual(["s"]);
    expect(ids(resolveNarrativeScope("N", after, subs))).toEqual([]);
  });

  it("does not list a Source in Trash and lists it again on restore", () => {
    // A trashed Source is absent from the project's resource list.
    const subs = subtypes({ N: ok("Narrative") });
    const live = [folder("N", null), res("s", "source", "N")];
    const trashed = [folder("N", null)];
    expect(ids(resolveNarrativeScope("N", trashed, subs))).toEqual([]);
    expect(ids(resolveNarrativeScope("N", live, subs))).toEqual(["s"]);
  });

  it("keeps a copy in another narrative as a separate variant", () => {
    const all = [
      folder("N1", null),
      folder("N2", null),
      res("orig", "source", "N1"),
      res("copy", "source", "N2"),
    ];
    const subs = subtypes({ N1: ok("Narrative"), N2: ok("Narrative") });
    expect(ids(resolveNarrativeScope("N1", all, subs))).toEqual(["orig"]);
    expect(ids(resolveNarrativeScope("N2", all, subs))).toEqual(["copy"]);
  });

  it("does not walk forever when a folder is its own ancestor", () => {
    const all = [
      folder("N", "B"),
      folder("B", "N"),
      folder("self", "self"),
      res("s", "source", "B"),
    ];
    const subs = subtypes({ N: ok("Narrative"), B: ok(null), self: ok(null) });
    expect(ids(resolveNarrativeScope("N", all, subs))).toEqual(["s"]);
    expect(ids(resolveNarrativeScope("self", all, subs))).toEqual([]);
  });

  it("marks a Source without the Variant subtype instead of omitting it", () => {
    const all = [
      folder("N", null),
      res("v", "source", "N", 0, " variant "),
      res("p", "source", "N", 1),
    ];
    const result = resolveNarrativeScope(
      "N",
      all,
      subtypes({ N: ok("Narrative") }),
    );
    if (result.kind !== "scope") throw new Error("expected scope");
    expect(result.variants.map((v) => [v.resource.id, v.isVariant])).toEqual([
      ["v", true],
      ["p", false],
    ]);
  });

  it("returns a distinct failed outcome when a nested folder's subtype read failed", () => {
    const all = [
      folder("N", null),
      folder("inner", "N"),
      res("s", "source", "inner"),
    ];
    const result = resolveNarrativeScope(
      "N",
      all,
      subtypes({
        N: ok("Narrative"),
        inner: { kind: "failed", reason: "EIO" },
      }),
    );
    expect(result).toEqual({
      kind: "failed",
      folderId: "inner",
      reason: "EIO",
    });
  });

  it("returns failed, not a scope, when a folder has no subtype read at all", () => {
    const all = [folder("N", null), folder("inner", "N")];
    const result = resolveNarrativeScope(
      "N",
      all,
      subtypes({ N: ok("Narrative") }),
    );
    expect(result.kind).toBe("failed");
  });

  it("returns failed when the narrative folder's own read failed", () => {
    const all = [folder("N", null)];
    const result = resolveNarrativeScope(
      "N",
      all,
      subtypes({ N: { kind: "failed", reason: "boom" } }),
    );
    expect(result).toEqual({ kind: "failed", folderId: "N", reason: "boom" });
  });

  it("returns missing for an id that is not a folder", () => {
    const all = [res("s", "source", null)];
    expect(resolveNarrativeScope("s", all, subtypes({}))).toEqual({
      kind: "missing",
      folderId: "s",
    });
  });
});

describe("listNarrativeFolders", () => {
  it("lists Narrative folders in tree order, matched by normalizeSubtypeLabel", () => {
    const all = [
      folder("b", null, 2),
      folder("a", null, 1),
      folder("a2", "a", 0),
      folder("plain", null, 3),
    ];
    const result = listNarrativeFolders(
      all,
      subtypes({
        a: ok("Narrative"),
        a2: ok("  NARRATIVE"),
        b: ok("Narrative"),
        plain: ok("Other"),
      }),
    );
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.narratives.map((f) => f.id)).toEqual(["a", "a2", "b"]);
  });

  it("reports failed folder reads, never as not-a-Narrative", () => {
    const all = [folder("a", null), folder("b", null)];
    const result = listNarrativeFolders(
      all,
      subtypes({ a: ok("Narrative"), b: { kind: "failed", reason: "EIO" } }),
    );
    expect(result).toEqual({
      kind: "failed",
      failures: [{ folderId: "b", reason: "EIO" }],
    });
  });
});
