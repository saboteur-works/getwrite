import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import type { AnyResource } from "../src/lib/models";
import type { AppDispatch } from "../src/store/store";

vi.mock("../src/store/resourcesSlice", () => ({
  updateFolders: (payload: unknown) => ({
    type: "resources/updateFolders",
    payload,
  }),
  updateResources: (payload: unknown) => ({
    type: "resources/updateResources",
    payload,
  }),
  persistReorder: (payload: unknown) => ({
    type: "projects/persistReorder",
    payload,
  }),
}));

import { useOrganizerCardReorder } from "../components/WorkArea/Views/OrganizerView/useOrganizerCardReorder";
import {
  ORGANIZER_FILTER_ACTIVE_REASON,
  ORGANIZER_ORDER_FLATTENED_REASON,
  ORGANIZER_ORDER_SMART_FOLDER_REASON,
  ORGANIZER_ORDER_USE_FIELD_DRAG_MESSAGE,
  ORGANIZER_ORDER_USE_TREE_MESSAGE,
  resolveOrderDrop,
  type OrderDropInput,
} from "../components/WorkArea/Views/OrganizerView/organizerOrderDrop";

const SIBLINGS = ["a", "b", "c", "d", "e"];

function input(overrides: Partial<OrderDropInput> = {}): OrderDropInput {
  return {
    source: { kind: "folder", scope: "children" },
    filterActive: false,
    siblingIds: SIBLINGS,
    activeCardId: "a",
    activeRowKey: "todo",
    overRowKey: "todo",
    rowCardIds: ["a", "c", "e"],
    overCardId: "e",
    ...overrides,
  };
}

describe("resolveOrderDrop", () => {
  it("maps a drop in a row band onto the full sibling order, keeping other rows' slots", () => {
    expect(resolveOrderDrop(input())).toEqual({
      kind: "reorder",
      newChildIds: ["c", "b", "e", "d", "a"],
    });
  });

  it("moves a card earlier within the band", () => {
    expect(
      resolveOrderDrop(input({ activeCardId: "e", overCardId: "a" })),
    ).toEqual({ kind: "reorder", newChildIds: ["e", "b", "a", "d", "c"] });
  });

  it("returns every sibling exactly once", () => {
    const result = resolveOrderDrop(input());
    if (result.kind !== "reorder") throw new Error("expected reorder");
    expect([...result.newChildIds].sort()).toEqual([...SIBLINGS].sort());
  });

  it("is a no-op when dropped on itself", () => {
    expect(resolveOrderDrop(input({ overCardId: "a" }))).toEqual({
      kind: "noop",
    });
  });

  it("is a no-op when dropped on nothing", () => {
    expect(resolveOrderDrop(input({ overCardId: null }))).toEqual({
      kind: "noop",
    });
  });

  it("refuses a drop into another row with the use-a-field-drag message", () => {
    expect(resolveOrderDrop(input({ overRowKey: "done" }))).toEqual({
      kind: "refused",
      reason: "other-row",
      message: ORGANIZER_ORDER_USE_FIELD_DRAG_MESSAGE,
    });
    expect(ORGANIZER_ORDER_USE_FIELD_DRAG_MESSAGE).toBe(
      "Use a field drag to change a card's row. Dropping on order only reorders within a row.",
    );
  });

  it("refuses a drop among another folder's cards with the do-it-in-the-tree message", () => {
    expect(resolveOrderDrop(input({ overCardId: "z-other-folder" }))).toEqual({
      kind: "refused",
      reason: "other-folder",
      message: ORGANIZER_ORDER_USE_TREE_MESSAGE,
    });
    expect(ORGANIZER_ORDER_USE_TREE_MESSAGE).toBe(
      "Moving a document between folders is done in the tree.",
    );
  });

  it("refuses when the dragged card is not a sibling of the browsed folder", () => {
    expect(
      resolveOrderDrop(
        input({ activeCardId: "z", rowCardIds: ["z", "c"], overCardId: "c" }),
      ),
    ).toMatchObject({ kind: "refused", reason: "other-folder" });
  });

  it("refuses the flattened (descendants) source with a reason", () => {
    expect(
      resolveOrderDrop(
        input({ source: { kind: "folder", scope: "descendants" } }),
      ),
    ).toEqual({
      kind: "refused",
      reason: "flattened-source",
      message: ORGANIZER_ORDER_FLATTENED_REASON,
    });
  });

  it("refuses the smart-folder source with a reason", () => {
    expect(
      resolveOrderDrop(input({ source: { kind: "smart-folder" } })),
    ).toEqual({
      kind: "refused",
      reason: "smart-folder-source",
      message: ORGANIZER_ORDER_SMART_FOLDER_REASON,
    });
  });

  it("refuses with `Clear filters to reorder cards` while a filter is active", () => {
    expect(ORGANIZER_FILTER_ACTIVE_REASON).toBe(
      "Clear filters to reorder cards",
    );
    expect(resolveOrderDrop(input({ filterActive: true }))).toEqual({
      kind: "refused",
      reason: "filter-active",
      message: "Clear filters to reorder cards",
    });
  });

  it("refuses a malformed band (active absent, duplicated cards)", () => {
    expect(resolveOrderDrop(input({ rowCardIds: ["c", "e"] }))).toMatchObject({
      kind: "refused",
      reason: "invalid-input",
    });
    expect(
      resolveOrderDrop(input({ rowCardIds: ["a", "c", "c", "e"] })),
    ).toMatchObject({ kind: "refused", reason: "invalid-input" });
    expect(
      resolveOrderDrop(input({ siblingIds: ["a", "a", "c", "e"] })),
    ).toMatchObject({ kind: "refused", reason: "invalid-input" });
  });
});

describe("resolveOrderDrop against useOrganizerCardReorder's input shape", () => {
  let dispatchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    dispatchMock = vi.fn();
  });

  it("feeds the hook's returned function a full unfiltered sibling id list", () => {
    const allChildren = SIBLINGS.map((id, i) => ({
      id,
      type: "text",
      name: id,
      folderId: "browsed",
      orderIndex: i,
    })) as unknown as AnyResource[];
    const reorder = useOrganizerCardReorder({
      dispatch: dispatchMock as unknown as AppDispatch,
      currentProject: { id: "p", rootPath: "/tmp/p" },
      projectDirectoryId: "p-dir",
      browsedFolderId: "browsed",
      allChildren,
    });

    const result = resolveOrderDrop(input());
    if (result.kind !== "reorder") throw new Error("expected reorder");
    reorder(result.newChildIds);

    const persist = dispatchMock.mock.calls
      .map((c) => c[0] as { type: string; payload: Record<string, unknown> })
      .find((a) => a.type === "projects/persistReorder");
    expect(persist?.payload.resourceOrder).toEqual(
      ["c", "b", "e", "d", "a"].map((id, i) => ({
        id,
        orderIndex: i,
        folderId: "browsed",
      })),
    );
    expect(persist?.payload.folderOrder).toEqual([]);
  });

  it("a refusal carries no newChildIds to pass on", () => {
    const result = resolveOrderDrop(input({ overRowKey: "done" }));
    expect(result.kind).toBe("refused");
    expect("newChildIds" in result).toBe(false);
  });
});

describe("organizerOrderDrop module", () => {
  it("imports no React, Redux or dnd-kit and no randomUUID", () => {
    const src = readFileSync(
      new URL(
        "../components/WorkArea/Views/OrganizerView/organizerOrderDrop.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(src).not.toMatch(
      /^\s*import[^;]*["'](react|react-redux|@reduxjs|@dnd-kit)/m,
    );
    expect(src).not.toMatch(/randomUUID/);
  });
});
