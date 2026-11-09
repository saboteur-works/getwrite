/**
 * Feature 101, Task 5 (FR-4, FR-6): initial selection from saved exclusions.
 */
import { describe, expect, it } from "vitest";
import { resolveInitialSelection } from "../../components/common/compile-defaults-selection";
import {
  buildCompileTree,
  initAllChecked,
  toggleNode,
} from "../../components/common/compileSelection";
import type { AnyResource } from "../../src/lib/models/types";

const ALL = ["a", "b", "c"];

describe("resolveInitialSelection", () => {
  it("selects every resource when the saved list is absent", () => {
    const r = resolveInitialSelection(ALL, undefined);
    expect([...r.selectedIds]).toEqual(ALL);
    expect(r.leftOutIds).toEqual([]);
  });

  it("selects every resource when the saved list is empty", () => {
    expect([...resolveInitialSelection(ALL, []).selectedIds]).toEqual(ALL);
  });

  it("selects everything except the excluded ids", () => {
    const r = resolveInitialSelection(ALL, ["b"]);
    expect([...r.selectedIds]).toEqual(["a", "c"]);
    expect(r.leftOutIds).toEqual(["b"]);
  });

  it("drops ids of resources that no longer exist, without error", () => {
    const r = resolveInitialSelection(ALL, ["gone", "b", "also-gone"]);
    expect([...r.selectedIds]).toEqual(["a", "c"]);
    expect(r.leftOutIds).toEqual(["b"]);
  });

  it("does not mutate its inputs", () => {
    const saved = ["gone", "b"];
    resolveInitialSelection(ALL, saved);
    expect(saved).toEqual(["gone", "b"]);
    expect(ALL).toEqual(["a", "b", "c"]);
  });

  it("treats every id alike, whatever the resource is", () => {
    const r = resolveInitialSelection(["x", "y"], ["x", "y"]);
    expect(r.selectedIds.size).toBe(0);
    expect(r.leftOutIds).toEqual(["x", "y"]);
  });
});

describe("an Inbox item in the compile and export selections (Feature 106, FR-16)", () => {
  const INBOX = "inbox-folder";
  const ITEM = "captured-item";
  const OTHER = "other-scene";
  const resources: AnyResource[] = [
    {
      id: INBOX,
      slug: "inbox",
      name: "Inbox",
      type: "folder",
      createdAt: "",
      updatedAt: "",
      userMetadata: {},
      orderIndex: 0,
    },
    {
      id: ITEM,
      slug: "captured",
      name: "Captured note",
      type: "text",
      plainText: "",
      createdAt: "",
      updatedAt: "",
      userMetadata: {},
      folderId: INBOX,
      orderIndex: 0,
    },
    {
      id: OTHER,
      slug: "other",
      name: "Other scene",
      type: "text",
      plainText: "",
      createdAt: "",
      updatedAt: "",
      userMetadata: {},
      orderIndex: 1,
    },
  ];
  const tree = buildCompileTree(resources);
  const leafIds = [...initAllChecked(tree)];
  // The shapes config holds after a capture: the seed writes compileDefaults only.
  const config: {
    inboxFolderId: string;
    compileDefaults?: { excludedResourceIds: string[] };
    exportDefaults?: { excludedResourceIds: string[] };
  } = {
    inboxFolderId: INBOX,
    compileDefaults: { excludedResourceIds: [ITEM] },
  };

  it("export starts with the item selected, because exportDefaults is untouched", () => {
    const r = resolveInitialSelection(
      leafIds,
      config.exportDefaults?.excludedResourceIds,
    );
    expect(r.selectedIds.has(ITEM)).toBe(true);
    expect(r.selectedIds.has(OTHER)).toBe(true);
    expect(r.leftOutIds).toEqual([]);
  });

  it("compile starts with the item unticked only because of the seeded exclusion", () => {
    const seeded = resolveInitialSelection(
      leafIds,
      config.compileDefaults?.excludedResourceIds,
    );
    expect(seeded.selectedIds.has(ITEM)).toBe(false);
    expect(seeded.leftOutIds).toEqual([ITEM]);
    expect(seeded.selectedIds.has(OTHER)).toBe(true);

    const withoutSeed = resolveInitialSelection(leafIds, []);
    expect(withoutSeed.selectedIds.has(ITEM)).toBe(true);
  });

  it("each default is overridable per run: ticking the item for compile, unticking it for export", () => {
    const compile = resolveInitialSelection(leafIds, [ITEM]).selectedIds;
    expect(toggleNode(ITEM, compile, tree).has(ITEM)).toBe(true);

    const exportSel = resolveInitialSelection(leafIds, undefined).selectedIds;
    expect(toggleNode(ITEM, exportSel, tree).has(ITEM)).toBe(false);
  });
});
