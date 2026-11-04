/** @vitest-environment jsdom */
/*
 * Feature 101, Task 16 (FR-12 write order, FR-14 delete, FR-15): the editor
 * write flows. Sidecar first for add; body then mark for delete; every
 * failure is surfaced with its stage; no revision call is ever made; text,
 * word count and plain text are unchanged by any flow.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import {
  ANNOTATION_TRANSACTION_META,
  addAnnotationFlow,
  removeAnnotationFlow,
  type AnnotationFlowApi,
} from "../../src/lib/annotation-flows";
import { tiptapToPlainText } from "../../src/lib/tiptap-utils";
import { countWords } from "../../src/lib/word-count";
import type { Annotation, TipTapDocument } from "../../src/lib/models";

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const editors: Editor[] = [];

function mount(content: JSONContent): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: baseSchemaExtensions,
    content,
  });
  editors.push(editor);
  return editor;
}

function plain(text: string): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function select(editor: Editor, from: number, to: number): void {
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, from, to),
    ),
  );
}

function markedText(editor: Editor, id: string): string {
  let out = "";
  editor.state.doc.descendants((node) => {
    if (
      node.isText &&
      node.marks.some((m) => m.type.name === "annotation" && m.attrs.id === id)
    )
      out += node.text;
  });
  return out;
}

function snapshot(editor: Editor): {
  text: string;
  words: number;
  plain: string;
} {
  const text = editor.getText();
  return {
    text,
    words: countWords(text),
    plain: tiptapToPlainText(editor.getJSON() as TipTapDocument),
  };
}

function stored(id: string, body: string, quote: string): Annotation {
  return { id, body, quote, createdAt: "t", updatedAt: "t" };
}

afterEach(() => {
  vi.restoreAllMocks();
  while (editors.length) editors.pop()?.destroy();
});

describe("addAnnotationFlow", () => {
  it("writes the sidecar first and applies the mark only after the write resolves", async () => {
    const editor = mount(plain("hello brave world"));
    select(editor, 7, 12);
    const order: string[] = [];
    let release: (a: Annotation) => void = () => undefined;
    const api: AnnotationFlowApi = {
      add: vi.fn(
        () =>
          new Promise<Annotation>((resolve) => {
            order.push("write-started");
            release = resolve;
          }),
      ),
      remove: vi.fn(),
    };
    const pending = addAnnotationFlow(api, {
      editor,
      projectId: "p",
      resourceId: "r",
      body: "note",
      range: { from: 7, to: 12 },
      id: ID,
    });
    await Promise.resolve();
    expect(order).toEqual(["write-started"]);
    expect(markedText(editor, ID)).toBe("");
    release(stored(ID, "note", "brave"));
    const result = await pending;
    expect(result).toEqual({
      ok: true,
      annotation: stored(ID, "note", "brave"),
    });
    expect(markedText(editor, ID)).toBe("brave");
    expect(api.add).toHaveBeenCalledWith("p", "r", {
      id: ID,
      body: "note",
      quote: "brave",
    });
  });

  it("a failed write applies no mark and surfaces the error message", async () => {
    const editor = mount(plain("hello brave world"));
    const before = editor.getJSON();
    const api: AnnotationFlowApi = {
      add: vi.fn().mockRejectedValue(new Error("Disk is full.")),
      remove: vi.fn(),
    };
    const result = await addAnnotationFlow(api, {
      editor,
      projectId: "p",
      resourceId: "r",
      body: "note",
      range: { from: 7, to: 12 },
      id: ID,
    });
    expect(result).toEqual({
      ok: false,
      stage: "write",
      message: "Disk is full.",
    });
    expect(editor.getJSON()).toEqual(before);
  });

  it("refuses an empty range without any write", async () => {
    const editor = mount(plain("hello"));
    const api: AnnotationFlowApi = { add: vi.fn(), remove: vi.fn() };
    const result = await addAnnotationFlow(api, {
      editor,
      projectId: "p",
      resourceId: "r",
      body: "note",
      range: { from: 3, to: 3 },
      id: ID,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.stage).toBe("empty-selection");
    expect(api.add).not.toHaveBeenCalled();
  });

  it("when the passage changed during the write, no mark is applied and the stored body is reported as detached", async () => {
    const editor = mount(plain("hello brave world"));
    const api: AnnotationFlowApi = {
      add: vi.fn(async () => {
        editor.view.dispatch(editor.state.tr.insertText("XX", 7, 9));
        return stored(ID, "note", "brave");
      }),
      remove: vi.fn(),
    };
    const result = await addAnnotationFlow(api, {
      editor,
      projectId: "p",
      resourceId: "r",
      body: "note",
      range: { from: 7, to: 12 },
      id: ID,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.stage).toBe("mark");
    expect(
      result.ok === false && result.stage === "mark" && result.annotation.id,
    ).toBe(ID);
    expect(markedText(editor, ID)).toBe("");
  });

  it("does not change text, word count or plain text, and calls nothing but the add write", async () => {
    const editor = mount(plain("hello brave world"));
    const before = snapshot(editor);
    const api: AnnotationFlowApi = {
      add: vi.fn().mockResolvedValue(stored(ID, "note", "brave")),
      remove: vi.fn(),
    };
    await addAnnotationFlow(api, {
      editor,
      projectId: "p",
      resourceId: "r",
      body: "note",
      range: { from: 7, to: 12 },
      id: ID,
    });
    expect(snapshot(editor)).toEqual(before);
    expect(api.add).toHaveBeenCalledTimes(1);
    expect(api.remove).not.toHaveBeenCalled();
  });

  it("tags its transaction so a consumer can tell it from a text edit", async () => {
    const editor = mount(plain("hello brave world"));
    const metas: unknown[] = [];
    editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged)
        metas.push(transaction.getMeta(ANNOTATION_TRANSACTION_META));
    });
    const api: AnnotationFlowApi = {
      add: vi.fn().mockResolvedValue(stored(ID, "n", "brave")),
      remove: vi.fn(),
    };
    select(editor, 7, 12);
    await addAnnotationFlow(api, {
      editor,
      projectId: "p",
      resourceId: "r",
      body: "n",
      range: { from: 7, to: 12 },
      id: ID,
    });
    expect(metas).toEqual([true]);
  });
});

function annotated(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "hello " },
          {
            type: "text",
            text: "brave",
            marks: [
              { type: "annotation", attrs: { id: ID } },
              { type: "annotation", attrs: { id: OTHER } },
            ],
          },
          { type: "text", text: " world" },
        ],
      },
    ],
  };
}

describe("removeAnnotationFlow", () => {
  it("removes the body, then the mark, leaving other marks and the text alone", async () => {
    const editor = mount(annotated());
    const before = snapshot(editor);
    const order: string[] = [];
    const api: AnnotationFlowApi = {
      add: vi.fn(),
      remove: vi.fn(async () => {
        order.push("body");
        expect(markedText(editor, ID)).toBe("brave");
      }),
    };
    const result = await removeAnnotationFlow(api, {
      editor,
      projectId: "p",
      resourceId: "r",
      annotationId: ID,
    });
    expect(result).toEqual({ ok: true });
    expect(order).toEqual(["body"]);
    expect(markedText(editor, ID)).toBe("");
    expect(markedText(editor, OTHER)).toBe("brave");
    expect(snapshot(editor)).toEqual(before);
  });

  it("a failed body delete surfaces the message and leaves the mark", async () => {
    const editor = mount(annotated());
    const api: AnnotationFlowApi = {
      add: vi.fn(),
      remove: vi.fn().mockRejectedValue(new Error("Locked.")),
    };
    const result = await removeAnnotationFlow(api, {
      editor,
      projectId: "p",
      resourceId: "r",
      annotationId: ID,
    });
    expect(result).toEqual({ ok: false, stage: "body", message: "Locked." });
    expect(markedText(editor, ID)).toBe("brave");
  });

  it("when the body is deleted but the mark cannot be removed, the failure is surfaced with stage 'mark' (a mark with no body is inert)", async () => {
    const editor = mount(annotated());
    const api: AnnotationFlowApi = {
      add: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(editor.view, "dispatch").mockImplementation(() => {
      throw new Error("view gone");
    });
    const result = await removeAnnotationFlow(api, {
      editor,
      projectId: "p",
      resourceId: "r",
      annotationId: ID,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.stage).toBe("mark");
    expect(result.ok === false && result.message).toBe("view gone");
  });

  it("deleting a detached annotation (no mark in the document) succeeds without a document change", async () => {
    const editor = mount(plain("hello"));
    const api: AnnotationFlowApi = {
      add: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const before = editor.getJSON();
    const result = await removeAnnotationFlow(api, {
      editor,
      projectId: "p",
      resourceId: "r",
      annotationId: ID,
    });
    expect(result).toEqual({ ok: true });
    expect(editor.getJSON()).toEqual(before);
  });
});
