/** @vitest-environment jsdom */
/**
 * @module useEditorPositionMemory.test
 *
 * Tests for `components/Editor/useEditorPositionMemory.ts`, the record and
 * restore wiring `TipTapEditor` uses (`specs/features/editor-position-memory.md`
 * FR-1, FR-3, FR-4, FR-6, FR-7, FR-8). `TipTapEditor` itself renders a mock
 * under Vitest, so these drive the hook with a real headless `Editor`, as
 * `editor-document-load-history.test.ts` does, mounted inside an element with
 * the scrolling element's class.
 *
 * jsdom does no layout: `scrollTop` is given a plain backing value per
 * element, and `requestAnimationFrame` is a queue the test flushes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import type { Content } from "@tiptap/react";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import { loadDocumentIntoEditor } from "../../components/Editor/loadDocumentIntoEditor";
import {
  getEditorPosition,
  recordEditorPosition,
} from "../../components/Editor/editorPositionMemory";
import {
  useEditorPositionMemory,
  type EditorPositionMemory,
} from "../../components/Editor/useEditorPositionMemory";

const chapter: Content = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "First paragraph of the chapter." }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Second paragraph, where I was." }],
    },
  ],
};

let frames: FrameRequestCallback[] = [];
function flushFrames(): void {
  // A restore may queue another frame; run until the queue is empty.
  for (let guard = 0; guard < 20 && frames.length > 0; guard += 1) {
    const pending = frames;
    frames = [];
    pending.forEach((callback) => callback(0));
  }
}

const editors: Editor[] = [];
let keyCounter = 0;
const uniqueKey = () => `project:doc-${(keyCounter += 1)}`;

interface Mounted {
  editor: Editor;
  scroller: HTMLElement;
}

function backScrollTop(element: HTMLElement): void {
  let scrollTop = 0;
  Object.defineProperty(element, "scrollTop", {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });
}

/** Phone width: the shell scrolls, the content wrapper does not. */
function mountPhoneEditor(): Mounted & { shell: HTMLElement } {
  const shell = document.createElement("div");
  shell.className = "tiptap-editor-shell";
  shell.style.overflowY = "auto";
  const content = document.createElement("div");
  content.className = "tiptap tiptap-editor-content";
  content.style.overflowY = "visible";
  backScrollTop(shell);
  backScrollTop(content);
  const host = document.createElement("div");
  content.appendChild(host);
  shell.appendChild(content);
  document.body.appendChild(shell);
  const editor = new Editor({
    element: host,
    extensions: baseSchemaExtensions,
    content: chapter,
  });
  editors.push(editor);
  return { editor, scroller: shell, shell };
}

function mountEditor(content: Content = chapter): Mounted {
  const scroller = document.createElement("div");
  scroller.className = "tiptap tiptap-editor-content";
  let scrollTop = 0;
  Object.defineProperty(scroller, "scrollTop", {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });
  const host = document.createElement("div");
  scroller.appendChild(host);
  document.body.appendChild(scroller);
  const editor = new Editor({
    element: host,
    extensions: baseSchemaExtensions,
    content,
  });
  editors.push(editor);
  return { editor, scroller };
}

interface HookProps {
  editor: Editor | null;
  positionKey: string | undefined;
  isRichMode: boolean;
}

/** The hook, with `onSelectionUpdate` wired as `TipTapEditor` wires it. */
function renderMemory(initial: HookProps) {
  const hook = renderHook(
    (props: HookProps) =>
      useEditorPositionMemory(
        props.editor,
        props.positionKey,
        props.isRichMode,
      ),
    { initialProps: initial },
  );
  const memory = (): EditorPositionMemory => hook.result.current;
  initial.editor?.on("selectionUpdate", ({ editor, transaction }) =>
    memory().recordSelection(editor, transaction),
  );
  return { ...hook, memory };
}

function scrollTo(scroller: HTMLElement, value: number): void {
  scroller.scrollTop = value;
  scroller.dispatchEvent(new Event("scroll"));
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    frames = [];
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  while (editors.length > 0) editors.pop()?.destroy();
  document.body.innerHTML = "";
});

describe("useEditorPositionMemory at phone width", () => {
  it("records and restores the shell's scroll when the shell is the scroller", () => {
    const key = uniqueKey();
    const first = mountPhoneEditor();
    const firstHook = renderMemory({
      editor: first.editor,
      positionKey: key,
      isRichMode: true,
    });
    act(() => {
      firstHook.memory().restore(first.editor);
      flushFrames();
    });
    act(() => {
      scrollTo(first.shell, 640);
    });
    expect(getEditorPosition(key)?.scrollTop).toBe(640);

    firstHook.unmount();
    first.editor.destroy();
    const second = mountPhoneEditor();
    const secondHook = renderMemory({
      editor: second.editor,
      positionKey: key,
      isRichMode: true,
    });
    act(() => {
      secondHook.memory().restore(second.editor);
      flushFrames();
    });
    expect(second.shell.scrollTop).toBe(640);
    expect(
      second.shell.querySelector<HTMLElement>(".tiptap-editor-content")
        ?.scrollTop,
    ).toBe(0);
  });
});

describe("useEditorPositionMemory", () => {
  it("does nothing without a key: restore reports off and nothing is recorded (FR-9)", () => {
    const { editor } = mountEditor();
    const { memory } = renderMemory({
      editor,
      positionKey: undefined,
      isRichMode: true,
    });
    expect(memory().restore(editor)).toBe(false);
    act(() => {
      editor.commands.setTextSelection(40);
    });
    expect(editor.state.selection.head).toBe(40);
    expect(frames).toHaveLength(0);
  });

  it("starts at the start and the top for a document with no record (FR-3, FR-4)", () => {
    const key = uniqueKey();
    const { editor, scroller } = mountEditor();
    scroller.scrollTop = 500;
    const { memory } = renderMemory({
      editor,
      positionKey: key,
      isRichMode: true,
    });
    act(() => {
      expect(memory().restore(editor)).toBe(true);
      flushFrames();
    });
    expect(editor.state.selection.from).toBe(1);
    expect(scroller.scrollTop).toBe(0);
  });

  it("records the writer's cursor and scroll, and puts both back in a new editor (FR-1, FR-3, FR-4)", () => {
    const key = uniqueKey();
    const first = mountEditor();
    const firstHook = renderMemory({
      editor: first.editor,
      positionKey: key,
      isRichMode: true,
    });
    act(() => {
      firstHook.memory().restore(first.editor);
      flushFrames();
    });
    act(() => {
      first.editor.commands.setTextSelection({ from: 36, to: 50 });
    });
    act(() => {
      scrollTo(first.scroller, 320);
    });
    expect(getEditorPosition(key)).toEqual({
      anchor: 36,
      head: 50,
      scrollTop: 320,
    });

    // The writer leaves: the editor is removed. They come back: a new one.
    firstHook.unmount();
    first.editor.destroy();
    const second = mountEditor();
    const secondHook = renderMemory({
      editor: second.editor,
      positionKey: key,
      isRichMode: true,
    });
    act(() => {
      secondHook.memory().restore(second.editor);
      flushFrames();
    });
    expect(second.editor.state.selection.anchor).toBe(36);
    expect(second.editor.state.selection.head).toBe(50);
    expect(second.scroller.scrollTop).toBe(320);
  });

  it("puts the position back after a load into the same, still-mounted editor", () => {
    const key = uniqueKey();
    recordEditorPosition(key, { anchor: 40, head: 40, scrollTop: 200 });
    const { editor, scroller } = mountEditor({ type: "doc", content: [] });
    const { memory } = renderMemory({
      editor,
      positionKey: key,
      isRichMode: true,
    });
    act(() => {
      memory().beginLoad();
      loadDocumentIntoEditor(editor, chapter);
      memory().restore(editor);
      flushFrames();
    });
    expect(editor.state.selection.head).toBe(40);
    expect(scroller.scrollTop).toBe(200);
    // The load and the restore moved the selection; neither was recorded.
    expect(getEditorPosition(key)).toEqual({
      anchor: 40,
      head: 40,
      scrollTop: 200,
    });
  });

  it("records to the document in the editor, not to a newer key that arrived before its load", () => {
    const shown = uniqueKey();
    const next = uniqueKey();
    const { editor } = mountEditor();
    const hook = renderMemory({ editor, positionKey: shown, isRichMode: true });
    act(() => {
      hook.memory().restore(editor);
      flushFrames();
    });
    hook.rerender({ editor, positionKey: next, isRichMode: true });
    act(() => {
      editor.commands.setTextSelection(20);
    });
    expect(getEditorPosition(shown)?.head).toBe(20);
    expect(getEditorPosition(next)).toBeNull();
  });

  it("records nothing and restores nothing while there is no key, as for an older revision (FR-7)", () => {
    const key = uniqueKey();
    recordEditorPosition(key, { anchor: 40, head: 40, scrollTop: 200 });
    const { editor, scroller } = mountEditor();
    const { memory } = renderMemory({
      editor,
      positionKey: undefined,
      isRichMode: true,
    });
    act(() => {
      memory().beginLoad();
      loadDocumentIntoEditor(editor, chapter);
      expect(memory().restore(editor)).toBe(false);
      flushFrames();
    });
    act(() => {
      editor.commands.setTextSelection(12);
      scrollTo(scroller, 90);
    });
    expect(scroller.scrollTop).toBe(90);
    expect(getEditorPosition(key)).toEqual({
      anchor: 40,
      head: 40,
      scrollTop: 200,
    });
  });

  it("records nothing while the Markdown source view is shown (FR-8)", () => {
    const key = uniqueKey();
    const { editor, scroller } = mountEditor();
    const hook = renderMemory({ editor, positionKey: key, isRichMode: true });
    act(() => {
      hook.memory().restore(editor);
      flushFrames();
    });
    act(() => {
      editor.commands.setTextSelection(40);
    });
    hook.rerender({ editor, positionKey: key, isRichMode: false });
    act(() => {
      editor.commands.setTextSelection(10);
      scrollTo(scroller, 400);
    });
    expect(getEditorPosition(key)).toEqual({
      anchor: 40,
      head: 40,
      scrollTop: 0,
    });
  });

  it("lets a selection change during a pending scroll restore win, as a mention jump does (FR-6)", () => {
    const key = uniqueKey();
    recordEditorPosition(key, { anchor: 40, head: 40, scrollTop: 300 });
    const { editor, scroller } = mountEditor();
    const { memory } = renderMemory({
      editor,
      positionKey: key,
      isRichMode: true,
    });
    act(() => {
      memory().restore(editor);
    });
    expect(editor.state.selection.head).toBe(40);
    // The mention jump: an ordinary selection change, then a native scroll,
    // before the restore's frame has run (EntityMentionsSection.tsx).
    act(() => {
      editor.chain().setTextSelection(10).scrollIntoView().run();
      scroller.scrollTop = 50;
      flushFrames();
    });
    expect(editor.state.selection.head).toBe(10);
    expect(scroller.scrollTop).toBe(50);
    expect(getEditorPosition(key)?.head).toBe(10);
  });
});
