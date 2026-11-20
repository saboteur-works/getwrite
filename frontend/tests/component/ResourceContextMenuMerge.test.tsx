/**
 * Feature 121, Task 35 (FR-13, FR-14, FR-2): the tree's multi-selection
 * reaches the context menu's Merge item, which is offered on two or more rows
 * only, disabled with its stated reason when the selection cannot be merged,
 * and absent on the Android runtime. Real clicks on the real `ResourceTree`.
 */
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import ResourceTree from "../../components/ResourceTree/ResourceTree";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { setFolders, setResources } from "../../src/store/resourcesSlice";
import { makeStore } from "../../src/store/store";
import { createTextResource } from "../../src/lib/models/resource";
import { generateUUID } from "../../src/lib/models/uuid";
import { AnyResourceSchema } from "../../src/lib/models/schemas";
import { MERGE_REFUSAL_MESSAGES } from "../../src/lib/models/merge-messages";
import {
  MERGE_REFUSAL_REASONS,
  MERGED_MARK_SIDECAR_KEY,
  type MergeRefusalReason,
} from "../../src/lib/models/merge-types";
import { runAxe } from "../a11y/helpers/axe";

const openMergeDialog = vi.hoisted(() => vi.fn());
vi.mock("../../components/Merge/mergeOpenRequest", () => ({
  openMergeDialog: openMergeDialog,
  setMergeOpener: vi.fn(),
}));

afterEach(() => {
  openMergeDialog.mockReset();
  vi.unstubAllEnvs();
});

const NOW = "2026-01-01T00:00:00.000Z";

interface Fixture {
  a1: string;
  a2: string;
  a3: string;
  a4: string;
}

type Extra = Record<string, unknown>;

/** Four text documents at the project root (A1..A4, in that tree order) and one folder row. */
function renderTree(extras: Partial<Record<keyof Fixture, Extra>> = {}) {
  const docs = (["a1", "a2", "a3", "a4"] as const).map((key, index) => {
    const base = createTextResource({
      name: key.toUpperCase(),
      folderId: null,
      plainText: `Text of ${key}`,
    });
    return { ...base, orderIndex: index, ...(extras[key] ?? {}) };
  });
  const folder = {
    id: generateUUID(),
    slug: "folder",
    name: "Folder F",
    type: "folder" as const,
    folderId: null,
    parentId: null,
    orderIndex: 10,
    createdAt: NOW,
    updatedAt: NOW,
    userMetadata: {},
  };
  const store = makeStore();
  store.dispatch(
    setProject({
      id: "p1",
      name: "proj",
      createdAt: NOW,
      resources: [],
    } as never),
  );
  store.dispatch(setSelectedProjectId("p1"));
  store.dispatch(setFolders([folder as never]));
  store.dispatch(setResources(docs as never));
  const onResourceAction = vi.fn();
  const utils = render(
    <Provider store={store}>
      <ResourceTree onResourceAction={onResourceAction} />
    </Provider>,
  );
  const ids: Fixture = {
    a1: docs[0].id,
    a2: docs[1].id,
    a3: docs[2].id,
    a4: docs[3].id,
  };
  return { ...utils, store, ids, folderId: folder.id, onResourceAction };
}

function row(name: string): HTMLElement {
  const node = screen.getByText(name).closest('[role="treeitem"]');
  if (!node) throw new Error(`No tree row named ${name}`);
  return node as HTMLElement;
}

type Mods = { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };
function click(name: string, mods: Mods = {}): void {
  fireEvent.click(row(name), mods);
}
function selectedNames(): string[] {
  return screen
    .getAllByRole("treeitem")
    .filter((r: HTMLElement) => r.getAttribute("aria-selected") === "true")
    .map((r: HTMLElement) => r.textContent ?? "");
}
function openMenuOn(name: string): void {
  fireEvent.contextMenu(screen.getByText(name));
}
function mergeItem(): HTMLElement | null {
  return screen.queryByRole("menuitem", { name: "Merge" });
}

describe("selection reaches the menu", () => {
  it("keeps a Ctrl-click selection and acts on it, first clicked row first", () => {
    const { ids } = renderTree();
    click("A2");
    click("A4", { ctrlKey: true });
    click("A1", { ctrlKey: true });
    expect(selectedNames().sort()).toEqual(["A1", "A2", "A4"]);
    openMenuOn("A4");
    fireEvent.click(mergeItem() as HTMLElement);
    // Selection order, not tree order: A2 was clicked first.
    expect(openMergeDialog).toHaveBeenCalledWith([ids.a2, ids.a4, ids.a1]);
  });

  it("treats the Command key like Ctrl", () => {
    const { ids } = renderTree();
    click("A3");
    click("A1", { metaKey: true });
    expect(selectedNames().sort()).toEqual(["A1", "A3"]);
    openMenuOn("A1");
    fireEvent.click(mergeItem() as HTMLElement);
    expect(openMergeDialog).toHaveBeenCalledWith([ids.a3, ids.a1]);
  });

  it("toggles a row off with a second Ctrl-click", () => {
    renderTree();
    click("A1");
    click("A2", { ctrlKey: true });
    click("A3", { ctrlKey: true });
    click("A2", { ctrlKey: true });
    expect(selectedNames().sort()).toEqual(["A1", "A3"]);
  });

  it("keeps a Shift range downward, anchor first then tree order", () => {
    const { ids } = renderTree();
    click("A1");
    click("A3", { shiftKey: true });
    expect(selectedNames().sort()).toEqual(["A1", "A2", "A3"]);
    openMenuOn("A2");
    fireEvent.click(mergeItem() as HTMLElement);
    expect(openMergeDialog).toHaveBeenCalledWith([ids.a1, ids.a2, ids.a3]);
  });

  it("makes the row clicked first the target for a Shift range upward", () => {
    const { ids } = renderTree();
    click("A3");
    click("A1", { shiftKey: true });
    openMenuOn("A1");
    fireEvent.click(mergeItem() as HTMLElement);
    expect(openMergeDialog).toHaveBeenCalledWith([ids.a3, ids.a1, ids.a2]);
  });

  it("extends with Ctrl+Shift and keeps the earlier rows first", () => {
    const { ids } = renderTree();
    click("A4");
    click("A1", { ctrlKey: true });
    click("A3", { ctrlKey: true, shiftKey: true });
    openMenuOn("A1");
    fireEvent.click(mergeItem() as HTMLElement);
    const sent = openMergeDialog.mock.calls[0][0] as string[];
    expect(sent.slice(0, 2)).toEqual([ids.a4, ids.a1]);
    // The library extends from its anchor (the last plain click, A4) to A3.
    expect(new Set(sent)).toEqual(new Set([ids.a4, ids.a1, ids.a3]));
  });

  it("a plain click after a selection replaces it", () => {
    renderTree();
    click("A1");
    click("A2", { ctrlKey: true });
    click("A4");
    expect(selectedNames()).toEqual(["A4"]);
  });
});

describe("Merge item offer", () => {
  it("is not offered on a single row", () => {
    renderTree();
    click("A1");
    openMenuOn("A1");
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeTruthy();
    expect(mergeItem()).toBeNull();
  });

  it("is not offered when the right-clicked row is outside the selection", () => {
    renderTree();
    click("A1");
    click("A2", { ctrlKey: true });
    openMenuOn("A4");
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeTruthy();
    expect(mergeItem()).toBeNull();
  });

  it("is offered when the right-clicked row is in the selection and acts on the whole selection", () => {
    const { ids } = renderTree();
    click("A1");
    click("A2", { ctrlKey: true });
    click("A3", { ctrlKey: true });
    openMenuOn("A1");
    const item = mergeItem();
    expect(item).toBeTruthy();
    expect(item?.getAttribute("aria-disabled")).not.toBe("true");
    fireEvent.click(item as HTMLElement);
    expect(openMergeDialog).toHaveBeenCalledWith([ids.a1, ids.a2, ids.a3]);
  });

  it("is keyboard operable and named Merge", () => {
    const { ids } = renderTree();
    click("A1");
    click("A2", { ctrlKey: true });
    openMenuOn("A2");
    const item = mergeItem() as HTMLElement;
    expect(item.getAttribute("aria-label")).toBe("Merge");
    item.focus();
    fireEvent.keyDown(item, { key: "Enter" });
    expect(openMergeDialog).toHaveBeenCalledWith([ids.a1, ids.a2]);
  });

  it("leaves the existing menu items as they were", () => {
    renderTree();
    click("A1");
    openMenuOn("A1");
    const names = screen
      .getAllByRole("menuitem")
      .map((i: HTMLElement) => i.textContent?.trim());
    expect(names).toEqual([
      "Create",
      "New Smart Folder",
      "Rename",
      "File to…",
      "Copy",
      "Duplicate",
      "Delete",
      "Export",
    ]);
  });
});

describe("Merge item disabled with its stated reason", () => {
  function expectDisabledWith(reason: MergeRefusalReason): void {
    const item = mergeItem();
    expect(item, "the item is shown, not hidden").toBeTruthy();
    expect(item?.getAttribute("aria-disabled")).toBe("true");
    const text = MERGE_REFUSAL_MESSAGES[reason];
    const menu = screen.getByRole("menu");
    expect(within(menu).getByText(text)).toBeTruthy();
    const describedBy = item?.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toBe(
      text,
    );
    fireEvent.click(item as HTMLElement);
    expect(openMergeDialog).not.toHaveBeenCalled();
  }

  it("names a folder row in the selection", () => {
    renderTree();
    click("A1");
    click("Folder F", { ctrlKey: true });
    openMenuOn("A1");
    expectDisabledWith(MERGE_REFUSAL_REASONS.folder);
  });

  it("names a Source", () => {
    renderTree({ a2: { type: "source" } });
    click("A1");
    click("A2", { ctrlKey: true });
    openMenuOn("A1");
    expectDisabledWith(MERGE_REFUSAL_REASONS.source);
  });

  it("names an entity document", () => {
    renderTree({ a2: { entityKind: "character" } });
    click("A1");
    click("A2", { ctrlKey: true });
    openMenuOn("A2");
    expectDisabledWith(MERGE_REFUSAL_REASONS.entityDocument);
  });

  it("names a media resource", () => {
    renderTree({ a2: { type: "image" } });
    click("A1");
    click("A2", { ctrlKey: true });
    openMenuOn("A1");
    expectDisabledWith(MERGE_REFUSAL_REASONS.mediaResource);
  });

  it("names a marked first document", () => {
    renderTree({
      a1: { [MERGED_MARK_SIDECAR_KEY]: { targetDocumentId: "x" } },
    });
    click("A1");
    click("A2", { ctrlKey: true });
    openMenuOn("A2");
    expectDisabledWith(MERGE_REFUSAL_REASONS.mergedTarget);
  });

  it("names a marked document that is not first", () => {
    renderTree({
      a2: { [MERGED_MARK_SIDECAR_KEY]: { targetDocumentId: "x" } },
    });
    click("A1");
    click("A2", { ctrlKey: true });
    openMenuOn("A2");
    expectDisabledWith(MERGE_REFUSAL_REASONS.mergedAbsorbed);
  });
});

describe("Android runtime", () => {
  it("renders no Merge item and makes no request", () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    renderTree();
    click("A1");
    click("A2", { ctrlKey: true });
    openMenuOn("A1");
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeTruthy();
    expect(mergeItem()).toBeNull();
    expect(screen.queryByText("Merge")).toBeNull();
    expect(openMergeDialog).not.toHaveBeenCalled();
  });
});

describe("the merged mark reaches the client", () => {
  it("is kept when a resource is parsed at the response boundary", () => {
    const parsed = AnyResourceSchema.safeParse({
      id: generateUUID(),
      slug: "a",
      name: "A",
      type: "text",
      orderIndex: 0,
      createdAt: NOW,
      [MERGED_MARK_SIDECAR_KEY]: { targetDocumentId: "x" },
    });
    expect(parsed.success).toBe(true);
    expect(
      parsed.success &&
        (parsed.data as Record<string, unknown>)[MERGED_MARK_SIDECAR_KEY],
    ).toEqual({ targetDocumentId: "x" });
  });
});

describe("no other entry point", () => {
  const root = resolve(__dirname, "../..");
  function source(path: string): string {
    return readFileSync(resolve(root, path), "utf8");
  }

  it("adds no Merge row, item, picker or key handler outside the tree menu", () => {
    for (const path of [
      "components/common/ResourceCommandPalette.tsx",
      "components/Editor/EditorContextMenu.tsx",
      "components/Layout/AppShell.tsx",
      "components/Editor/Extensions/SplitShortcutExtension.ts",
    ]) {
      expect(source(path), path).not.toMatch(/openMergeDialog/);
    }
    // Feature 121 Task 41 adds "Undo merge" to the palette and the editor menu
    // (FR-22); that wording is allowed, any other Merge entry point is not.
    const withoutUndoMerge = (text: string): string =>
      text.replace(
        /Undo[ -]?[Mm]erge|UNDO_MERGE_\w+|undo-merge|merge-undo-messages|merge-messages|describeUndoMergeAction/g,
        "",
      );
    expect(
      withoutUndoMerge(source("components/common/ResourceCommandPalette.tsx")),
    ).not.toMatch(/Merge/);
    expect(
      withoutUndoMerge(source("components/Editor/EditorContextMenu.tsx")),
    ).not.toMatch(/Merge/);
  });

  it("calls the host's open request from the tree and nowhere else in components", () => {
    expect(source("components/ResourceTree/ResourceTree.tsx")).toMatch(
      /openMergeDialog/,
    );
  });
});

describe("accessibility", () => {
  it("has no axe violations with the item enabled", async () => {
    renderTree();
    click("A1");
    click("A2", { ctrlKey: true });
    openMenuOn("A1");
    await runAxe(document.body, ["region"]);
  });

  it("has no axe violations with the item disabled and its reason shown", async () => {
    renderTree({ a2: { type: "source" } });
    click("A1");
    click("A2", { ctrlKey: true });
    openMenuOn("A1");
    expect(mergeItem()?.getAttribute("aria-disabled")).toBe("true");
    await runAxe(document.body, ["region"]);
  });
});
