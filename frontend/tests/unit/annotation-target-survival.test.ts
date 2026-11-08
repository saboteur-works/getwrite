/** @vitest-environment jsdom */
/**
 * Feature 103, Task 27 (FR-24 survival, FR-25 copy with new identity, kept on
 * move): an annotation `target` `{ sourceId, attachmentId, excerptId, locator,
 * sourceName }` survives a write, `remapCopiedAnnotations`, a duplicate, a
 * resource copy, a paste and a Trash restore. A copy keeps the target and gets
 * a new annotation id; a cut-and-paste (move) keeps the id and the target.
 * Real files, real locks, a real TipTap editor for the paste cases.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import AnnotationClipboard, {
  clearLastClipboardOperation,
} from "../../components/Editor/Extensions/annotation-clipboard";
import NormalizePastedText from "../../components/Editor/Extensions/NormalizePastedText";
import AnnotationPaste, {
  type AnnotationPasteApi,
  type AnnotationPasteResult,
} from "../../components/Editor/Extensions/annotation-paste";
import { remapCopiedAnnotations } from "../../src/lib/models/annotation-copy";
import {
  addAnnotationCore,
  listAnnotationsCore,
} from "../../src/lib/models/annotations-core";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import {
  copyResourceCore,
  createResourceCore,
} from "../../src/lib/models/resource-crud-core";
import { duplicateResource } from "../../src/lib/models/resource-templates";
import { readSidecar } from "../../src/lib/models/sidecar";
import {
  restoreResource,
  softDeleteResource,
} from "../../src/lib/models/trash";
import { generateUUID } from "../../src/lib/models/uuid";
import type { Annotation, AnnotationTarget } from "../../src/lib/models/types";
import { removeDirRetry } from "./helpers/fs-utils";

const A = "11111111-1111-4111-8111-111111111111";
const SOURCE_ID = "550e8400-e29b-41d4-a716-446655440011";
const ATTACHMENT_ID = "550e8400-e29b-41d4-a716-446655440012";
const EXCERPT_ID = "550e8400-e29b-41d4-a716-446655440010";

const fullTarget: AnnotationTarget = {
  sourceId: SOURCE_ID,
  attachmentId: ATTACHMENT_ID,
  excerptId: EXCERPT_ID,
  locator: { type: "timestamp", value: "01:02:03" },
  sourceName: "Interview tape",
};

let batchRoot = "";
let projectId = "";
let projectRoot = "";
const originalProjectsDir = process.env.GETWRITE_PROJECTS_DIR;
const editors: Editor[] = [];

async function makeText(
  type: "text" | "source",
  withMark: boolean,
): Promise<string> {
  const created = await createResourceCore(projectId, {
    type,
    name: type === "source" ? "Citing source" : "Chapter",
    text: { plainText: "plain noted tail" },
  });
  if (withMark) {
    await fs.writeFile(
      path.join(projectRoot, "resources", created.id, "content.tiptap.json"),
      JSON.stringify(markedDoc([A])),
      "utf8",
    );
  }
  return created.id;
}

function markedDoc(ids: string[]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "plain " },
          {
            type: "text",
            text: "noted",
            marks: ids.map((id) => ({ type: "annotation", attrs: { id } })),
          },
          { type: "text", text: " tail" },
        ],
      },
    ],
  };
}

async function citing(id: string): Promise<Annotation> {
  return addAnnotationCore(projectId, id, {
    id: A,
    body: "see tape",
    quote: "noted",
    target: fullTarget,
  });
}

async function stored(id: string): Promise<Annotation[]> {
  return listAnnotationsCore(projectId, id);
}

beforeEach(async () => {
  clearLastClipboardOperation();
  batchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-ann-survive-"));
  process.env.GETWRITE_PROJECTS_DIR = batchRoot;
  projectId = generateUUID();
  projectRoot = path.join(batchRoot, projectId);
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, PROJECT_FILENAME),
    JSON.stringify(createProject({ name: "annotation target survival" })),
    "utf8",
  );
});

afterEach(async () => {
  for (const e of editors.splice(0)) e.destroy();
  await flushIndexer();
  if (originalProjectsDir === undefined)
    delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalProjectsDir;
  await removeDirRetry(batchRoot);
});

describe("write", () => {
  it("stores and lists the full target unchanged", async () => {
    const id = await makeText("text", true);
    const written = await citing(id);
    expect(written.target).toEqual(fullTarget);
    expect((await stored(id))[0].target).toEqual(fullTarget);
  });
});

describe("remapCopiedAnnotations", () => {
  it("gives a new annotation id and keeps the target", async () => {
    const id = await makeText("text", true);
    await citing(id);
    const sidecar = (await readSidecar(projectRoot, id))!;
    const out = await remapCopiedAnnotations(projectRoot, id, sidecar);
    const notes = out.annotations as unknown as Annotation[];
    expect(notes).toHaveLength(1);
    expect(notes[0].id).not.toBe(A);
    expect(notes[0].target).toEqual(fullTarget);
  });
});

describe("duplicate and copy", () => {
  it("duplicateResource keeps the target under a new annotation id", async () => {
    const id = await makeText("text", true);
    await citing(id);
    const { newId } = await duplicateResource(projectRoot, id);
    const notes = await stored(newId);
    expect(notes).toHaveLength(1);
    expect(notes[0].id).not.toBe(A);
    expect(notes[0].target).toEqual(fullTarget);
    expect((await stored(id))[0].id).toBe(A);
  });

  it("copyResourceCore keeps the target under a new annotation id", async () => {
    const id = await makeText("text", true);
    await citing(id);
    const copy = await copyResourceCore(projectId, id, "Chapter copy");
    const notes = await stored(copy.id as string);
    expect(notes).toHaveLength(1);
    expect(notes[0].id).not.toBe(A);
    expect(notes[0].target).toEqual(fullTarget);
  });

  it("a duplicated Source keeps a target that cites another Source", async () => {
    const id = await makeText("source", true);
    await citing(id);
    const { newId } = await duplicateResource(projectRoot, id);
    expect((await stored(newId))[0].target).toEqual(fullTarget);
  });
});

describe("Trash restore", () => {
  it("restores a Source whose annotation cites another Source with the target intact", async () => {
    const id = await makeText("source", true);
    await citing(id);
    await softDeleteResource(projectRoot, id);
    await restoreResource(projectRoot, id);
    const notes = await stored(id);
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe(A);
    expect(notes[0].target).toEqual(fullTarget);
  });

  it("restores a text resource with the target intact", async () => {
    const id = await makeText("text", true);
    await citing(id);
    await softDeleteResource(projectRoot, id);
    await restoreResource(projectRoot, id);
    expect((await stored(id))[0].target).toEqual(fullTarget);
  });
});

describe("paste", () => {
  interface Mounted {
    editor: Editor;
    results: AnnotationPasteResult[];
    settled: () => Promise<AnnotationPasteResult>;
  }

  function mount(resourceId: string, content: JSONContent): Mounted {
    const results: AnnotationPasteResult[] = [];
    let wake: (() => void) | null = null;
    const api: AnnotationPasteApi = {
      list: listAnnotationsCore,
      add: vi.fn<AnnotationPasteApi["add"]>(addAnnotationCore),
    };
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [
        ...baseSchemaExtensions,
        NormalizePastedText.configure({ bodyFontSize: undefined }),
        AnnotationClipboard.configure({ getResourceId: () => resourceId }),
        AnnotationPaste.configure({
          getResourceId: () => resourceId,
          getProjectId: () => projectId,
          api,
          onResult: (result) => {
            results.push(result);
            wake?.();
          },
        }),
      ],
      content,
    });
    editors.push(editor);
    return {
      editor,
      results,
      settled: () =>
        results.length > 0
          ? Promise.resolve(results[results.length - 1])
          : new Promise((resolve) => {
              wake = () => resolve(results[results.length - 1]);
            }),
    };
  }

  function select(editor: Editor, from: number, to: number): void {
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, from, to),
      ),
    );
  }

  function take(m: Mounted, kind: "cut" | "copy"): string {
    select(m.editor, 7, 12);
    const html = m.editor.view.serializeForClipboard(
      m.editor.state.selection.content(),
    ).dom.innerHTML;
    vi.useFakeTimers();
    try {
      m.editor.view.dom.dispatchEvent(
        new Event(kind, { bubbles: true, cancelable: true }),
      );
      vi.runAllTimers();
    } finally {
      vi.useRealTimers();
    }
    return html;
  }

  function paste(m: Mounted, html: string): void {
    const end = m.editor.state.doc.content.size - 1;
    select(m.editor, end, end);
    m.editor.view.pasteHTML(html, new Event("paste") as ClipboardEvent);
  }

  function ids(editor: Editor): string[] {
    const found: string[] = [];
    editor.state.doc.descendants((node) => {
      for (const mark of node.marks) {
        if (mark.type.name === "annotation")
          found.push(mark.attrs.id as string);
      }
    });
    return found;
  }

  it("a copy pasted into another resource has a new id and keeps the full target", async () => {
    const from = await makeText("text", true);
    const to = await makeText("text", false);
    await citing(from);
    const src = mount(from, markedDoc([A]));
    const dst = mount(to, { type: "doc", content: [{ type: "paragraph" }] });
    paste(dst, take(src, "copy"));
    expect(await dst.settled()).toEqual({ ok: true });
    const notes = await stored(to);
    expect(notes).toHaveLength(1);
    expect(notes[0].id).not.toBe(A);
    expect(notes[0].body).toBe("see tape");
    expect(notes[0].target).toEqual(fullTarget);
    expect((await stored(from))[0].target).toEqual(fullTarget);
  });

  it("a cut then paste in the same resource (a move) keeps the id and writes nothing, so the target stays", async () => {
    const from = await makeText("text", true);
    await citing(from);
    const m = mount(from, markedDoc([A]));
    const before = await fs.readFile(
      path.join(projectRoot, "meta", `resource-${from}.meta.json`),
      "utf8",
    );
    paste(m, take(m, "cut"));
    expect(ids(m.editor)).toEqual([A]);
    expect(await stored(from)).toHaveLength(1);
    expect((await stored(from))[0].target).toEqual(fullTarget);
    expect(
      await fs.readFile(
        path.join(projectRoot, "meta", `resource-${from}.meta.json`),
        "utf8",
      ),
    ).toBe(before);
  });
});
