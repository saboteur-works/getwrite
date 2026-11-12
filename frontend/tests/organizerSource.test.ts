import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  listChildrenSource,
  listDescendantsSource,
  resolveSmartFolderSource,
  resolveOrganizerSource,
} from "../components/WorkArea/Views/OrganizerView/organizerSource";
import {
  buildResourceTree,
  ROOT_ITEM_ID,
} from "../components/ResourceTree/buildResourceTree";
import type {
  AnyResource,
  Folder,
  TextResource,
} from "../src/lib/models/types";

function makeFolder(
  id: string,
  orderIndex: number,
  parentId: string | null = null,
): Folder {
  return {
    id,
    slug: id,
    name: id,
    type: "folder",
    createdAt: "2026-01-01T00:00:00.000Z",
    orderIndex,
    userMetadata: {},
    parentId,
  };
}

function makeText(
  id: string,
  orderIndex: number,
  folderId?: string,
): TextResource {
  return {
    id,
    slug: id,
    name: id,
    type: "text",
    createdAt: "2026-01-01T00:00:00.000Z",
    orderIndex,
    wordCount: 0,
    userMetadata: {},
    folderId,
  } as TextResource;
}

const ids = (list: AnyResource[]): string[] => list.map((r) => r.id);

/** The order the tree shows: depth-first, each parent's children by orderIndex (ResourceTree getChildren). */
function treeOrder(all: AnyResource[]): string[] {
  const tree = buildResourceTree(all);
  const out: string[] = [];
  const walk = (id: string): void => {
    const sorted = [...tree[id].children].sort(
      (a, b) => (tree[a]?.orderIndex ?? 0) - (tree[b]?.orderIndex ?? 0),
    );
    for (const child of sorted) {
      out.push(child);
      if (tree[child].isFolder) walk(child);
    }
  };
  walk(ROOT_ITEM_ID);
  return out;
}

const isDocument = (all: AnyResource[], id: string): boolean =>
  all.find((r) => r.id === id)?.type !== "folder";

// Parent holds, by orderIndex: DocA, Folder1(DocX, Sub(DocY), DocZ), DocB, Folder2(DocW), DocC
const project: AnyResource[] = [
  makeText("DocC", 4, "Parent"),
  makeFolder("Folder2", 3, "Parent"),
  makeText("DocW", 0, "Folder2"),
  makeText("DocB", 2, "Parent"),
  makeText("DocZ", 2, "Folder1"),
  makeFolder("Sub", 1, "Folder1"),
  makeText("DocY", 0, "Sub"),
  makeFolder("Folder1", 1, "Parent"),
  makeText("DocX", 0, "Folder1"),
  makeText("DocA", 0, "Parent"),
  makeFolder("Parent", 0),
  makeText("RootDoc", 5),
];

describe("listChildrenSource", () => {
  it("keeps today's order: folders first, then documents, each by orderIndex", () => {
    const r = listChildrenSource("Parent", project);
    expect(ids(r.cards)).toEqual([
      "Folder1",
      "Folder2",
      "DocA",
      "DocB",
      "DocC",
    ]);
    expect(r.missingIds).toEqual([]);
  });

  it("reports a folder id that is not in the project", () => {
    const r = listChildrenSource("nope", project);
    expect(r.cards).toEqual([]);
    expect(r.missingIds).toEqual(["nope"]);
  });

  it("reports an id that is a document, not a folder", () => {
    const r = listChildrenSource("DocA", project);
    expect(r.cards).toEqual([]);
    expect(r.missingIds).toEqual(["DocA"]);
  });
});

describe("listDescendantsSource", () => {
  it("is depth-first, interleaved as the tree does, documents only", () => {
    const r = listDescendantsSource("Parent", project);
    expect(ids(r.cards)).toEqual([
      "DocA",
      "DocX",
      "DocY",
      "DocZ",
      "DocB",
      "DocW",
      "DocC",
    ]);
  });

  it("matches the order buildResourceTree produces for the same data", () => {
    const full = treeOrder(project);
    const start = full.indexOf("Parent") + 1;
    const end = full.indexOf("RootDoc");
    const insideParent = full
      .slice(start, end)
      .filter((id) => isDocument(project, id));
    expect(insideParent.length).toBe(7);
    expect(ids(listDescendantsSource("Parent", project).cards)).toEqual(
      insideParent,
    );
  });

  it("matches the tree on a tie in orderIndex (input order breaks it)", () => {
    const tied: AnyResource[] = [
      makeFolder("P", 0),
      makeText("t2", 1, "P"),
      makeFolder("F", 1, "P"),
      makeText("t1", 1, "P"),
      makeText("inF", 0, "F"),
    ];
    const full = treeOrder(tied);
    expect(ids(listDescendantsSource("P", tied).cards)).toEqual(
      full.slice(1).filter((id) => isDocument(tied, id)),
    );
  });

  it("excludes folders from the result even when nested", () => {
    const r = listDescendantsSource("Parent", project);
    expect(r.cards.every((c) => c.type !== "folder")).toBe(true);
  });

  it("returns nothing for an empty folder and reports a missing folder", () => {
    const withEmpty = [...project, makeFolder("Empty", 9)];
    expect(listDescendantsSource("Empty", withEmpty)).toEqual({
      cards: [],
      missingIds: [],
      skippedFolderIds: [],
    });
    expect(listDescendantsSource("nope", project).missingIds).toEqual(["nope"]);
  });

  it("terminates on a folder cycle", () => {
    const cyc = [makeFolder("A", 0, "B"), makeFolder("B", 0, "A")];
    expect(listDescendantsSource("A", cyc).cards).toEqual([]);
  });
});

describe("resolveSmartFolderSource", () => {
  it("returns the documents in tree order whatever the id order", () => {
    const wanted = ["DocC", "RootDoc", "DocY", "DocA"];
    const r = resolveSmartFolderSource(wanted, project);
    const full = treeOrder(project);
    expect(ids(r.cards)).toEqual(
      [...wanted].sort((a, b) => full.indexOf(a) - full.indexOf(b)),
    );
    expect(ids(r.cards)).toEqual(["DocA", "DocY", "DocC", "RootDoc"]);
    expect(r.missingIds).toEqual([]);
  });

  it("reports an id missing from the project and still returns the rest", () => {
    const r = resolveSmartFolderSource(["DocA", "ghost", "ghost2"], project);
    expect(ids(r.cards)).toEqual(["DocA"]);
    expect(r.missingIds).toEqual(["ghost", "ghost2"]);
  });

  it("returns documents only: a folder id is reported as skipped", () => {
    const r = resolveSmartFolderSource(["Folder1", "DocA"], project);
    expect(ids(r.cards)).toEqual(["DocA"]);
    expect(r.skippedFolderIds).toEqual(["Folder1"]);
    expect(r.missingIds).toEqual([]);
  });

  it("lists a document once when the id list repeats it", () => {
    const r = resolveSmartFolderSource(["DocA", "DocA"], project);
    expect(ids(r.cards)).toEqual(["DocA"]);
  });

  it("places a document whose folder is missing at the root, as the tree does", () => {
    const orphaned = [...project, makeText("Orphan", 0, "gone")];
    const full = treeOrder(orphaned);
    const r = resolveSmartFolderSource(["Orphan", "DocA"], orphaned);
    expect(ids(r.cards)).toEqual(
      ["Orphan", "DocA"].sort((a, b) => full.indexOf(a) - full.indexOf(b)),
    );
  });

  it("returns an empty list for no ids", () => {
    expect(resolveSmartFolderSource([], project).cards).toEqual([]);
  });
});

describe("resolveOrganizerSource", () => {
  it("dispatches on the source kind and scope", () => {
    const children = resolveOrganizerSource(
      { kind: "folder", folderId: "Parent", scope: "children" },
      project,
    );
    expect(ids(children.cards)[0]).toBe("Folder1");
    const flat = resolveOrganizerSource(
      { kind: "folder", folderId: "Parent", scope: "descendants" },
      project,
    );
    expect(ids(flat.cards)[0]).toBe("DocA");
    const smart = resolveOrganizerSource(
      { kind: "smart-folder", queryId: "q" },
      project,
      ["DocC", "DocA"],
    );
    expect(ids(smart.cards)).toEqual(["DocA", "DocC"]);
    expect(smart.unresolved).toBe(false);
  });

  it("reports a smart-folder source with no id list as unresolved", () => {
    const r = resolveOrganizerSource(
      { kind: "smart-folder", queryId: "q" },
      project,
      undefined,
    );
    expect(r.cards).toEqual([]);
    expect(r.unresolved).toBe(true);
  });
});

describe("module imports", () => {
  it("imports no React, Redux or @dnd-kit and no randomUUID", () => {
    const src = readFileSync(
      resolve(
        __dirname,
        "../components/WorkArea/Views/OrganizerView/organizerSource.ts",
      ),
      "utf8",
    );
    const imports = src.match(/from\s+["'][^"']+["']/g) ?? [];
    expect(imports.length).toBeGreaterThan(0);
    for (const i of imports) {
      expect(i).not.toMatch(/react|redux|@dnd-kit/i);
    }
    expect(src).not.toMatch(/randomUUID/);
  });
});
