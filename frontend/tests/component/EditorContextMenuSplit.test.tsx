import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import resourcesReducer from "../../src/store/resourcesSlice";
import { runAxe } from "../a11y/helpers/axe";
import { flushPendingEffects } from "../helpers/flushEffects";
import EditorContextMenu from "../../components/Editor/EditorContextMenu";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import { SPLIT_REFUSAL_MESSAGES } from "../../src/lib/models/split-messages";
import {
  MERGED_MARK_SIDECAR_KEY,
  SPLIT_REFUSAL_REASONS,
  type SplitRefusalReason,
} from "../../src/lib/models/split-types";

const openSplitDialogMock = vi.hoisted(() => vi.fn());
vi.mock("../../components/Split/splitOpenRequest", () => ({
  openSplitDialog: openSplitDialogMock,
  setSplitOpener: vi.fn(),
}));

const editors: Editor[] = [];

function mountEditor(): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const editor = new Editor({
    element,
    extensions: baseSchemaExtensions,
    content: "<p>Some document text</p>",
  });
  editors.push(editor);
  return editor;
}

type ResourceFixture = Record<string, unknown> & { id: string };

function renderMenu(resource: ResourceFixture | null) {
  const store = configureStore({
    reducer: { resources: resourcesReducer },
    preloadedState: {
      resources: {
        selectedResourceId: resource ? resource.id : null,
        resources: resource ? [resource] : [],
        folders: [],
        suppressNextViewAutoSwitch: false,
      },
    },
  } as never);
  const editor = mountEditor();
  render(
    <Provider store={store}>
      <EditorContextMenu editor={editor}>
        <EditorContent editor={editor} data-testid="prosemirror" />
      </EditorContextMenu>
    </Provider>,
  );
  return editor;
}

function openMenu(): void {
  fireEvent.contextMenu(screen.getByTestId("prosemirror"));
  act(() => vi.runAllTimers());
}

const TEXT: ResourceFixture = { id: "r1", type: "text", name: "Doc" };

describe("EditorContextMenu Split item", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    openSplitDialogMock.mockReset();
    openSplitDialogMock.mockReturnValue("started");
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    while (editors.length > 0) editors.pop()?.destroy();
  });

  it("shows an enabled Split item for a text document and requests the dialog on select", () => {
    renderMenu(TEXT);
    openMenu();
    const item = screen.getByRole("menuitem", { name: "Split" });
    expect(item.hasAttribute("data-disabled")).toBe(false);
    fireEvent.click(item);
    expect(openSplitDialogMock).toHaveBeenCalledTimes(1);
  });

  it("is operable with the keyboard (Enter on the focused item)", () => {
    renderMenu(TEXT);
    openMenu();
    const item = screen.getByRole("menuitem", { name: "Split" });
    act(() => item.focus());
    fireEvent.keyDown(item, { key: "Enter" });
    expect(openSplitDialogMock).toHaveBeenCalledTimes(1);
  });

  const REFUSED: Array<[string, ResourceFixture, SplitRefusalReason]> = [
    [
      "image",
      { id: "r1", type: "image", name: "Pic" },
      SPLIT_REFUSAL_REASONS.mediaResource,
    ],
    [
      "audio",
      { id: "r1", type: "audio", name: "Clip" },
      SPLIT_REFUSAL_REASONS.mediaResource,
    ],
    [
      "Source",
      { id: "r1", type: "source", name: "Src" },
      SPLIT_REFUSAL_REASONS.source,
    ],
    [
      "entity",
      { id: "r1", type: "text", name: "Ent", entityKind: "character" },
      SPLIT_REFUSAL_REASONS.entityDocument,
    ],
    [
      "merged",
      { id: "r1", type: "text", name: "Mrg", [MERGED_MARK_SIDECAR_KEY]: {} },
      SPLIT_REFUSAL_REASONS.mergedDocument,
    ],
  ];

  it.each(REFUSED)(
    "a %s document: Split is shown disabled with its stated reason, reachable by description, and makes no request",
    (_label, resource, reason) => {
      renderMenu(resource);
      openMenu();
      const item = screen.getByRole("menuitem", { name: "Split" });
      expect(item.hasAttribute("data-disabled")).toBe(true);
      expect(item.getAttribute("aria-disabled")).toBe("true");
      const describedBy = item.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      const reasonEl = document.getElementById(describedBy as string);
      expect(reasonEl?.textContent).toBe(SPLIT_REFUSAL_MESSAGES[reason]);
      expect(reasonEl?.hasAttribute("hidden")).toBe(false);
      fireEvent.click(item);
      expect(openSplitDialogMock).not.toHaveBeenCalled();
    },
  );

  it("is not rendered on the native runtime and makes no request", () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    renderMenu(TEXT);
    openMenu();
    expect(screen.queryByRole("menuitem", { name: "Split" })).toBeNull();
    expect(openSplitDialogMock).not.toHaveBeenCalled();
  });

  it("is not rendered when no store is mounted (the item list is unchanged)", () => {
    const editor = mountEditor();
    render(
      <EditorContextMenu editor={editor}>
        <EditorContent editor={editor} data-testid="prosemirror" />
      </EditorContextMenu>,
    );
    openMenu();
    expect(screen.queryByRole("menuitem", { name: "Split" })).toBeNull();
  });

  it.each([
    ["enabled", TEXT],
    ["disabled", { id: "r1", type: "source", name: "Src" } as ResourceFixture],
  ])("axe passes with the %s Split item", async (_state, resource) => {
    renderMenu(resource);
    openMenu();
    vi.useRealTimers();
    await flushPendingEffects();
    await runAxe(document.body, ["region"]);
  });
});
