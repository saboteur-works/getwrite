import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { runAxe } from "./a11y/helpers/axe";
import EditorContextMenu from "../components/Editor/EditorContextMenu";
import { baseSchemaExtensions } from "../components/Editor/editorExtensions";
import { flushPendingEffects } from "./helpers/flushEffects";

// Mirrors editorContextMenu.test.tsx's own mountEditor/openMenu conventions
// (a real TipTap `Editor` instance, Radix's DismissableLayer pointerdown
// setTimeout flushed via fake timers) rather than inventing a new harness.
function openMenu(target: HTMLElement) {
  return fireEvent.contextMenu(target);
}

const editors: Editor[] = [];

function mountEditor(content: string): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const editor = new Editor({
    element,
    extensions: baseSchemaExtensions,
    content,
  });
  editors.push(editor);
  return editor;
}

afterEach(() => {
  while (editors.length > 0) {
    editors.pop()?.destroy();
  }
});

function renderWithContent() {
  const editor = mountEditor("<p>Some document text</p>");
  const result = render(
    <EditorContextMenu editor={editor}>
      <EditorContent editor={editor} data-testid="prosemirror" />
    </EditorContextMenu>,
  );
  return { editor, ...result };
}

// `ContextMenuContent` renders through a Radix `Portal` straight to
// `document.body` (`components/common/UI/ContextMenu/ContextMenu.tsx`), a
// sibling of `render()`'s own container rather than a descendant of it — so
// `runAxe(container)` would never see the open menu's content at all. Each
// test below calls `runAxe(document.body, ...)` instead, which covers both
// the portal and the render container beneath it, and disables axe-core's
// `region` best-practice rule: mounting only the menu in isolation (rather
// than the full app shell, whose own landmarks the menu would sit inside in
// production) makes axe flag the portal wrapper as "content not in a
// landmark region" — a test-harness-isolation artifact, not a real page
// defect (`runAxe`'s own doc comment, `tests/a11y/helpers/axe.ts`).

let clipboardReadText: ReturnType<typeof vi.fn>;
let clipboardWriteText: ReturnType<typeof vi.fn>;

describe("a11y: EditorContextMenu", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clipboardReadText = vi.fn().mockResolvedValue("");
    clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: clipboardReadText, writeText: clipboardWriteText },
      writable: true,
      configurable: true,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("axe passes with the menu open over a non-empty selection (all items enabled)", async () => {
    const { editor } = renderWithContent();
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 5 });
    });

    openMenu(screen.getByTestId("prosemirror"));
    act(() => vi.runAllTimers());

    expect(screen.getByRole("menu")).toBeTruthy();
    // axe-core's own internal scheduling relies on real timers; fake
    // timers (needed above only to flush Radix's DismissableLayer
    // pointerdown setTimeout so the menu actually opens) must be torn
    // down first, or `axe.run()` never resolves.
    vi.useRealTimers();
    // Switching back to real timers doesn't replay any Radix rAF/
    // ResizeObserver-driven internal update (Presence/PopperContent/
    // FocusScope/DismissableLayer) still pending from opening the menu
    // under fake timers above — flush it before the axe scan touches
    // the DOM, so it lands inside act() rather than during the scan.
    await flushPendingEffects();
    await runAxe(document.body, ["region"]);
  });

  it("axe passes with the menu open over a collapsed cursor (Cut/Copy disabled, Paste/formatting/Select All enabled)", async () => {
    const { editor } = renderWithContent();
    act(() => {
      editor.commands.setTextSelection(1);
    });

    openMenu(screen.getByTestId("prosemirror"));
    act(() => vi.runAllTimers());

    expect(screen.getByText("Cut").closest("[data-disabled]")).toBeTruthy();
    expect(screen.getByText("Copy").closest("[data-disabled]")).toBeTruthy();
    expect(screen.getByText("Paste").closest("[data-disabled]")).toBeFalsy();
    // axe-core's own internal scheduling relies on real timers; fake
    // timers (needed above only to flush Radix's DismissableLayer
    // pointerdown setTimeout so the menu actually opens) must be torn
    // down first, or `axe.run()` never resolves.
    vi.useRealTimers();
    // Switching back to real timers doesn't replay any Radix rAF/
    // ResizeObserver-driven internal update (Presence/PopperContent/
    // FocusScope/DismissableLayer) still pending from opening the menu
    // under fake timers above — flush it before the axe scan touches
    // the DOM, so it lands inside act() rather than during the scan.
    await flushPendingEffects();
    await runAxe(document.body, ["region"]);
  });

  it("axe passes with the menu open on a read-only editor (Cut/Paste disabled, Copy/formatting/Select All enabled)", async () => {
    const { editor } = renderWithContent();
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 5 });
      editor.setEditable(false);
    });

    openMenu(screen.getByTestId("prosemirror"));
    act(() => vi.runAllTimers());

    expect(screen.getByText("Cut").closest("[data-disabled]")).toBeTruthy();
    expect(screen.getByText("Paste").closest("[data-disabled]")).toBeTruthy();
    expect(screen.getByText("Copy").closest("[data-disabled]")).toBeFalsy();
    expect(
      screen.getByText("Select All").closest("[data-disabled]"),
    ).toBeFalsy();
    // axe-core's own internal scheduling relies on real timers; fake
    // timers (needed above only to flush Radix's DismissableLayer
    // pointerdown setTimeout so the menu actually opens) must be torn
    // down first, or `axe.run()` never resolves.
    vi.useRealTimers();
    // Switching back to real timers doesn't replay any Radix rAF/
    // ResizeObserver-driven internal update (Presence/PopperContent/
    // FocusScope/DismissableLayer) still pending from opening the menu
    // under fake timers above — flush it before the axe scan touches
    // the DOM, so it lands inside act() rather than during the scan.
    await flushPendingEffects();
    await runAxe(document.body, ["region"]);
  });

  it("axe passes with an active formatting item rendered as a checkmark (Bold checked)", async () => {
    const { editor } = renderWithContent();
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 5 });
      editor.commands.toggleBold();
      editor.commands.setTextSelection({ from: 1, to: 5 });
    });
    expect(editor.isActive("bold")).toBe(true);

    openMenu(screen.getByTestId("prosemirror"));
    act(() => vi.runAllTimers());

    // axe-core's own internal scheduling relies on real timers; fake
    // timers (needed above only to flush Radix's DismissableLayer
    // pointerdown setTimeout so the menu actually opens) must be torn
    // down first, or `axe.run()` never resolves.
    vi.useRealTimers();
    // Switching back to real timers doesn't replay any Radix rAF/
    // ResizeObserver-driven internal update (Presence/PopperContent/
    // FocusScope/DismissableLayer) still pending from opening the menu
    // under fake timers above — flush it before the axe scan touches
    // the DOM, so it lands inside act() rather than during the scan.
    await flushPendingEffects();
    await runAxe(document.body, ["region"]);
  });
});
