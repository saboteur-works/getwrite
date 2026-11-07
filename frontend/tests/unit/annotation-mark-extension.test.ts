/** @vitest-environment jsdom */
/*
 * Feature 101, Task 15 (FR-9, FR-13, FR-18 editor half): the `annotation`
 * TipTap mark. Id-only, overlapping, non-inclusive, adds no characters, and
 * inert when no sidecar body exists for its id.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import AnnotationMark from "../../components/Editor/Extensions/AnnotationMarkExtension";
import {
  persistResourceContent,
  tiptapToPlainText,
} from "../../src/lib/tiptap-utils";
import { countWords } from "../../src/lib/word-count";
import { diffWords } from "../../src/lib/models/word-diff";
import { TipTapNodeSchema } from "../../src/lib/models/schemas";
import type { TipTapDocument } from "../../src/lib/models";
import { removeDirRetry } from "./helpers/fs-utils";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const editors: Editor[] = [];

function paragraph(runs: JSONContent[]): JSONContent {
  return { type: "doc", content: [{ type: "paragraph", content: runs }] };
}

function run(text: string, ids: string[] = []): JSONContent {
  return {
    type: "text",
    text,
    ...(ids.length
      ? { marks: ids.map((id) => ({ type: "annotation", attrs: { id } })) }
      : {}),
  };
}

function mount(content: JSONContent, onUpdate?: () => void): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: baseSchemaExtensions,
    content,
    // An explicit `onUpdate: undefined` replaces TipTap's default handler and
    // makes the first transaction throw, so the key is only set when given.
    ...(onUpdate ? { onUpdate } : {}),
  });
  editors.push(editor);
  return editor;
}

/** Positions are doc positions; paragraph content starts at 1. */
function select(editor: Editor, from: number, to: number = from): void {
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, from, to),
    ),
  );
}

/** Types like the keyboard does: `insertText` at the selection. */
function typeText(editor: Editor, text: string): void {
  editor.view.dispatch(editor.state.tr.insertText(text));
}

/** Each text run with the annotation ids covering it. */
function coverage(editor: Editor): { text: string; ids: string[] }[] {
  const out: { text: string; ids: string[] }[] = [];
  editor.state.doc.descendants((node) => {
    if (!node.isText || !node.text) return;
    const ids = node.marks
      .filter((m) => m.type.name === "annotation")
      .map((m) => m.attrs.id as string)
      .sort();
    out.push({ text: node.text, ids });
  });
  return out;
}

function annotated(editor: Editor, id: string): string {
  return coverage(editor)
    .filter((c) => c.ids.includes(id))
    .map((c) => c.text)
    .join("");
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

afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});

describe("annotation mark definition (FR-9, FR-13)", () => {
  it("has attribute { id } only, excludes '' and inclusive false", () => {
    const editor = mount(paragraph([run("hello")]));
    const markType = editor.schema.marks.annotation;
    expect(Object.keys(markType.spec.attrs ?? {})).toEqual(["id"]);
    expect(markType.spec.excludes).toBe("");
    expect(markType.spec.inclusive).toBe(false);
    expect(AnnotationMark.name).toBe("annotation");
  });
});

describe("annotation mark edges and edits (FR-13)", () => {
  // "one two three": "two" occupies positions 5..8
  const doc = paragraph([run("one "), run("two", [A]), run(" three")]);

  it("text typed at the start edge stays outside the passage", () => {
    const editor = mount(doc);
    select(editor, 5);
    typeText(editor, "X");
    expect(editor.getText()).toBe("one Xtwo three");
    expect(annotated(editor, A)).toBe("two");
  });

  it("text typed at the end edge stays outside the passage", () => {
    const editor = mount(doc);
    select(editor, 8);
    typeText(editor, "X");
    expect(editor.getText()).toBe("one twoX three");
    expect(annotated(editor, A)).toBe("two");
  });

  it("typing inside the passage joins it", () => {
    const editor = mount(doc);
    select(editor, 6);
    typeText(editor, "X");
    expect(annotated(editor, A)).toBe("tXwo");
  });

  it("deleting text around the passage leaves it on its passage", () => {
    const editor = mount(doc);
    editor.view.dispatch(editor.state.tr.delete(1, 5)); // "one "
    editor.view.dispatch(
      editor.state.tr.delete(4, editor.state.doc.content.size - 1),
    ); // " three"
    expect(editor.getText()).toBe("two");
    expect(annotated(editor, A)).toBe("two");
  });

  it("cutting and pasting text around the passage keeps the mark on it", () => {
    const editor = mount(doc);
    const cut = editor.state.doc.slice(1, 5); // "one "
    editor.view.dispatch(editor.state.tr.delete(1, 5));
    const end = editor.state.doc.content.size - 1;
    editor.view.dispatch(editor.state.tr.replaceRange(end, end, cut));
    expect(editor.getText()).toBe("two threeone ");
    expect(annotated(editor, A)).toBe("two");
  });

  it("overlapping marks on the same text coexist", () => {
    const loaded = mount(paragraph([run("one "), run("two", [A, B])]));
    expect(coverage(loaded).find((c) => c.text === "two")?.ids).toEqual([A, B]);

    // a second mark added to text that already carries the first
    const added = mount(doc);
    added.view.dispatch(
      added.state.tr.addMark(
        5,
        8,
        added.schema.marks.annotation.create({ id: B }),
      ),
    );
    expect(annotated(added, A)).toBe("two");
    expect(annotated(added, B)).toBe("two");
  });
});

describe("annotation mark adds no characters (FR-9)", () => {
  const plain = paragraph([run("one two three")]);
  const marked = paragraph([run("one "), run("two", [A]), run(" three")]);
  const overlapped = paragraph([
    run("one "),
    run("two", [A, B]),
    run(" three"),
  ]);

  it("adding the mark leaves text, word count and plain text unchanged", () => {
    const editor = mount(plain);
    const before = snapshot(editor);
    editor.view.dispatch(
      editor.state.tr.addMark(
        5,
        8,
        editor.schema.marks.annotation.create({ id: A }),
      ),
    );
    expect(annotated(editor, A)).toBe("two");
    expect(snapshot(editor)).toEqual(before);
  });

  it("editing (replacing the id of) the mark leaves them unchanged", () => {
    const editor = mount(marked);
    const before = snapshot(editor);
    editor.view.dispatch(
      editor.state.tr
        .removeMark(5, 8, editor.schema.marks.annotation)
        .addMark(5, 8, editor.schema.marks.annotation.create({ id: B })),
    );
    expect(annotated(editor, B)).toBe("two");
    expect(snapshot(editor)).toEqual(before);
  });

  it("removing the mark leaves them unchanged", () => {
    const editor = mount(overlapped);
    const before = snapshot(editor);
    editor.view.dispatch(
      editor.state.tr.removeMark(1, 14, editor.schema.marks.annotation),
    );
    expect(annotated(editor, A)).toBe("");
    expect(snapshot(editor)).toEqual(before);
  });

  it("content.txt is identical with and without the mark", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "annotation-mark-"));
    try {
      await persistResourceContent(dir, "plain", plain as TipTapDocument);
      await persistResourceContent(dir, "marked", marked as TipTapDocument);
      const read = (id: string): Promise<string> =>
        fs.readFile(`${dir}/resources/${id}/content.txt`, "utf8");
      expect(await read("marked")).toBe(await read("plain"));
      expect(await read("marked")).toBe("one two three");
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("the revision diff of a text-only edit is the same with and without the mark", () => {
    const edit = (content: JSONContent): ReturnType<typeof diffWords> => {
      const editor = mount(content);
      const before = tiptapToPlainText(editor.getJSON() as TipTapDocument);
      select(editor, 1);
      typeText(editor, "Zed ");
      const after = tiptapToPlainText(editor.getJSON() as TipTapDocument);
      return diffWords(before, after);
    };
    expect(edit(marked)).toEqual(edit(plain));
    expect(edit(plain)).toEqual({ added: 1, deleted: 0, net: 1 });
  });
});

describe("annotation mark persistence (FR-9)", () => {
  it("is accepted by TipTapNodeSchema and survives save and reload", async () => {
    const editor = mount(
      paragraph([run("one "), run("two", [A, B]), run(" three")]),
    );
    const json = editor.getJSON() as TipTapDocument;
    expect(TipTapNodeSchema.safeParse(json).success).toBe(true);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "annotation-mark-"));
    try {
      await persistResourceContent(dir, "r", json);
      const raw = await fs.readFile(
        `${dir}/resources/r/content.tiptap.json`,
        "utf8",
      );
      const reloaded = mount(JSON.parse(raw) as JSONContent);
      expect(coverage(reloaded)).toEqual(coverage(editor));
      expect(annotated(reloaded, A)).toBe("two");
      expect(annotated(reloaded, B)).toBe("two");
    } finally {
      await removeDirRetry(dir);
    }
  });
});

describe("annotation mark without a body (FR-18)", () => {
  const orphan = paragraph([
    run("one "),
    run("two", ["no-body-id"]),
    run(" end"),
  ]);

  it("loads without error and the document is not rewritten at ordinary load", () => {
    let updates = 0;
    const editor = mount(orphan, () => {
      updates += 1;
    });
    expect(editor.getText()).toBe("one two end");
    expect(updates).toBe(0);
    // Paragraph attrs are schema defaults; the runs and their marks are the
    // document's own content and must come back exactly as stored.
    expect(editor.getJSON().content?.[0].content).toEqual(
      orphan.content?.[0].content,
    );
    expect(annotated(editor, "no-body-id")).toBe("two");
  });

  it("saves with the mark intact and the text unchanged", async () => {
    const editor = mount(orphan);
    select(editor, 1);
    typeText(editor, "Hi ");
    const json = editor.getJSON() as TipTapDocument;
    expect(TipTapNodeSchema.safeParse(json).success).toBe(true);
    expect(annotated(editor, "no-body-id")).toBe("two");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "annotation-mark-"));
    try {
      await persistResourceContent(dir, "r", json);
      expect(await fs.readFile(`${dir}/resources/r/content.txt`, "utf8")).toBe(
        "Hi one two end",
      );
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("shows no annotation text in the rendered editor", () => {
    const editor = mount(orphan);
    expect(editor.view.dom.textContent).toBe("one two end");
  });
});
