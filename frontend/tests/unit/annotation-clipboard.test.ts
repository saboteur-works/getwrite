/** @vitest-environment jsdom */
/*
 * Feature 101, Task 20 (FR-19 proof half, OQ-12): the editor's `cut` and
 * `copy` DOM handlers record the last clipboard operation, so a cut is told
 * from a copy of annotated text, with the annotation ids and source resource
 * id. No paste logic is involved.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import AnnotationClipboard, {
  clearLastClipboardOperation,
  getLastClipboardOperation,
} from "../../components/Editor/Extensions/annotation-clipboard";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const RES_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RES_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const editors: Editor[] = [];

function run(text: string, ids: string[] = []): JSONContent {
  return {
    type: "text",
    text,
    ...(ids.length
      ? { marks: ids.map((id) => ({ type: "annotation", attrs: { id } })) }
      : {}),
  };
}

function mountWith(resourceId: string | null, runs: JSONContent[]): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [
      ...baseSchemaExtensions,
      AnnotationClipboard.configure({ getResourceId: () => resourceId }),
    ],
    content: { type: "doc", content: [{ type: "paragraph", content: runs }] },
  });
  editors.push(editor);
  return editor;
}

/** "plain " (1-6), "noted" annotated A (7-11), " tail" plain. */
function mount(resourceId: string | null): Editor {
  return mountWith(resourceId, [
    run("plain "),
    run("noted", [A]),
    run(" tail"),
  ]);
}

function select(editor: Editor, from: number, to: number): void {
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, from, to),
    ),
  );
}

function fire(editor: Editor, type: "cut" | "copy"): void {
  editor.view.dom.dispatchEvent(
    new Event(type, { bubbles: true, cancelable: true }),
  );
}

// A copy or cut with no `clipboardData` makes prosemirror-view schedule a 50 ms
// timer that calls `view.focus()`. Fake timers let afterEach run it while the
// document still exists, so none is left to fire after jsdom teardown.
beforeEach(() => {
  vi.useFakeTimers();
  clearLastClipboardOperation();
});

afterEach(() => {
  vi.runAllTimers();
  for (const e of editors.splice(0)) e.destroy();
  const pending = vi.getTimerCount();
  vi.useRealTimers();
  expect(pending).toBe(0);
});

describe("annotation clipboard recorder", () => {
  it("records a copy of annotated text with its id and the source resource", () => {
    const editor = mount(RES_1);
    select(editor, 7, 12);
    fire(editor, "copy");
    expect(getLastClipboardOperation()).toEqual({
      kind: "copy",
      annotationIds: [A],
      sourceResourceId: RES_1,
    });
    expect(editor.getText()).toBe("plain noted tail");
  });

  it("records a cut of the same text as a cut, with the same id and resource", () => {
    const editor = mount(RES_1);
    select(editor, 7, 12);
    fire(editor, "cut");
    expect(getLastClipboardOperation()).toEqual({
      kind: "cut",
      annotationIds: [A],
      sourceResourceId: RES_1,
    });
  });

  it("tells the two apart when they alternate on identical selections", () => {
    const editor = mount(RES_1);
    select(editor, 7, 12);
    fire(editor, "copy");
    const afterCopy = getLastClipboardOperation();
    fire(editor, "cut");
    const afterCut = getLastClipboardOperation();
    expect(afterCopy?.kind).toBe("copy");
    expect(afterCut?.kind).toBe("cut");
  });

  it("carries the resource id of the editor the operation came from", () => {
    const one = mount(RES_1);
    const two = mount(RES_2);
    select(one, 7, 12);
    fire(one, "copy");
    select(two, 7, 12);
    fire(two, "cut");
    expect(getLastClipboardOperation()?.sourceResourceId).toBe(RES_2);
  });

  it("records distinct ids for overlapping annotations and none for plain text", () => {
    const editor = mountWith(RES_1, [
      run("ab", [A]),
      run("cd", [A, B]),
      run("ef"),
    ]);
    select(editor, 1, 7);
    fire(editor, "copy");
    expect(getLastClipboardOperation()?.annotationIds).toEqual([A, B]);
    select(editor, 5, 7);
    fire(editor, "copy");
    expect(getLastClipboardOperation()).toEqual({
      kind: "copy",
      annotationIds: [],
      sourceResourceId: RES_1,
    });
  });

  it("a later plain cut replaces an earlier annotated copy", () => {
    const editor = mount(RES_1);
    select(editor, 7, 12);
    fire(editor, "copy");
    select(editor, 1, 4);
    fire(editor, "cut");
    expect(getLastClipboardOperation()).toEqual({
      kind: "cut",
      annotationIds: [],
      sourceResourceId: RES_1,
    });
  });

  it("records nothing for an empty selection and keeps the earlier record", () => {
    const editor = mount(RES_1);
    select(editor, 7, 12);
    fire(editor, "copy");
    select(editor, 3, 3);
    fire(editor, "copy");
    expect(getLastClipboardOperation()?.annotationIds).toEqual([A]);
  });

  it("records a null source when the editor has no resource id", () => {
    const editor = mount(null);
    select(editor, 7, 12);
    fire(editor, "copy");
    expect(getLastClipboardOperation()?.sourceResourceId).toBeNull();
  });
});
