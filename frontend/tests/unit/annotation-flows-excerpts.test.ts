/** @vitest-environment jsdom */
/*
 * Feature 103, Task 28 (FR-21, FR-22, FR-25 failed write, OQ-1): excerpt flows
 * over the annotation write flows. New file (sibling tasks edit the existing
 * annotation test files).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import {
  addAnnotationFlow,
  addAttachmentExcerptFlow,
  addTextExcerptFlow,
  type AnnotationFlowApi,
} from "../../src/lib/annotation-flows";
import { isDetachedAnnotation } from "../../src/lib/models/excerpts";
import { TrashItemKindSchema } from "../../src/lib/models/schemas";
import type { Annotation } from "../../src/lib/models/types";
import type { NewAnnotation } from "../../src/lib/api/annotations";

const ID = "11111111-1111-4111-8111-111111111111";
const SOURCE = "22222222-2222-4222-8222-222222222222";
const ATT = "33333333-3333-4333-8333-333333333333";
const editors: Editor[] = [];

function mount(text: string): Editor {
  const content: JSONContent = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: baseSchemaExtensions,
    content,
  });
  editors.push(editor);
  return editor;
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

function recordingApi(): { api: AnnotationFlowApi; added: NewAnnotation[] } {
  const added: NewAnnotation[] = [];
  const api: AnnotationFlowApi = {
    add: vi.fn(async (_p, _r, a: NewAnnotation) => {
      added.push(a);
      return { ...a, createdAt: "t", updatedAt: "t" } as Annotation;
    }),
    remove: vi.fn(async () => undefined),
  };
  return { api, added };
}

afterEach(() => {
  vi.unstubAllGlobals();
  while (editors.length) editors.pop()?.destroy();
});

describe("text excerpt of a Source", () => {
  it("stores an annotation in the Source body with target, locator and quote, and marks the text", async () => {
    const editor = mount("Hello brave world");
    const { api, added } = recordingApi();
    const r = await addTextExcerptFlow(api, {
      editor,
      projectId: "p",
      resourceId: SOURCE,
      range: { from: 7, to: 12 },
      id: ID,
      body: "",
      sourceName: "Diary",
      locator: { type: "page", value: "4" },
    });
    expect(r.ok).toBe(true);
    expect(added).toEqual([
      {
        id: ID,
        body: "",
        quote: "brave",
        target: {
          sourceId: SOURCE,
          sourceName: "Diary",
          locator: { type: "page", value: "4" },
        },
      },
    ]);
    expect(markedText(editor, ID)).toBe("brave");
  });
  it("makes no write and no mark for a locator over its limit", async () => {
    const editor = mount("Hello brave world");
    const { api, added } = recordingApi();
    const r = await addTextExcerptFlow(api, {
      editor,
      projectId: "p",
      resourceId: SOURCE,
      range: { from: 7, to: 12 },
      id: ID,
      body: "",
      locator: { value: "x".repeat(501) },
    });
    expect(r).toMatchObject({ ok: false, stage: "invalid" });
    expect(added).toEqual([]);
    expect(markedText(editor, ID)).toBe("");
  });
});

describe("locator-only excerpt of an attachment", () => {
  it("adds one annotation on the Source: target, empty body, empty quote, no mark", async () => {
    const { api, added } = recordingApi();
    const r = await addAttachmentExcerptFlow(api, {
      projectId: "p",
      sourceId: SOURCE,
      attachmentId: ATT,
      locator: { type: "timestamp", value: "00:42" },
      id: ID,
    });
    expect(r.ok).toBe(true);
    expect(added).toEqual([
      {
        id: ID,
        body: "",
        quote: "",
        target: {
          sourceId: SOURCE,
          attachmentId: ATT,
          locator: { type: "timestamp", value: "00:42" },
        },
      },
    ]);
    expect(api.add).toHaveBeenCalledWith("p", SOURCE, expect.anything());
  });
  it("reports a failed write as stage write and stores nothing else", async () => {
    const api: AnnotationFlowApi = {
      add: vi.fn(async () => {
        throw new Error("disk full");
      }),
      remove: vi.fn(async () => undefined),
    };
    const r = await addAttachmentExcerptFlow(api, {
      projectId: "p",
      sourceId: SOURCE,
      attachmentId: ATT,
      locator: { value: "1" },
    });
    expect(r).toEqual({ ok: false, stage: "write", message: "disk full" });
  });
  it("refuses an invalid locator before any write", async () => {
    const { api, added } = recordingApi();
    const r = await addAttachmentExcerptFlow(api, {
      projectId: "p",
      sourceId: SOURCE,
      attachmentId: ATT,
      locator: { value: "" },
    });
    expect(r).toMatchObject({ ok: false, stage: "invalid" });
    expect(added).toEqual([]);
  });
});

describe("failed write after a mark (FR-25)", () => {
  it("a failed sidecar write applies no mark", async () => {
    const editor = mount("Hello brave world");
    const api: AnnotationFlowApi = {
      add: vi.fn(async () => {
        throw new Error("nope");
      }),
      remove: vi.fn(async () => undefined),
    };
    const r = await addAnnotationFlow(api, {
      editor,
      projectId: "p",
      resourceId: SOURCE,
      body: "",
      range: { from: 7, to: 12 },
      id: ID,
      target: { sourceId: SOURCE },
    });
    expect(r).toMatchObject({ ok: false, stage: "write" });
    expect(markedText(editor, ID)).toBe("");
  });
  it("a failed mark step leaves the body stored and the annotation listed as detached", async () => {
    const editor = mount("Hello brave world");
    const { api } = recordingApi();
    vi.spyOn(editor.view, "dispatch").mockImplementation(() => {
      throw new Error("view failed");
    });
    const r = await addTextExcerptFlow(api, {
      editor,
      projectId: "p",
      resourceId: SOURCE,
      range: { from: 7, to: 12 },
      id: ID,
      body: "n",
    });
    expect(r).toMatchObject({ ok: false, stage: "mark" });
    if (r.ok || r.stage !== "mark") throw new Error("expected mark stage");
    expect(r.annotation.target).toEqual({ sourceId: SOURCE });
    expect(isDetachedAnnotation(r.annotation, false)).toBe(true);
    expect(markedText(editor, ID)).toBe("");
  });
});

describe("no new Trash kind, no excerpt index (FR-21, FR-22)", () => {
  it("pins the Trash kinds", () => {
    expect(TrashItemKindSchema.options).toEqual([
      "resource",
      "folder",
      "attachment",
    ]);
  });
  it("adds no excerpt index file or module", async () => {
    const dir = path.resolve(__dirname, "../../src/lib/models");
    const files = await fs.readdir(dir);
    expect(
      files.filter((f) => /excerpt.*index|index.*excerpt/i.test(f)),
    ).toEqual([]);
    const src = await fs.readFile(path.join(dir, "excerpts.ts"), "utf8");
    expect(src).not.toMatch(/meta\/index|writeFile|mutateSidecar|node:fs/);
  });
});

describe("insecure context: no crypto.randomUUID (paired device over HTTP)", () => {
  const V4 =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  function stubNoRandomUUID(): void {
    vi.stubGlobal("crypto", {
      getRandomValues: globalThis.crypto.getRandomValues.bind(
        globalThis.crypto,
      ),
    });
  }

  it("addAnnotationFlow makes a v4 id and calls the transport", async () => {
    stubNoRandomUUID();
    const editor = mount("Hello brave world");
    const { api, added } = recordingApi();
    const r = await addAnnotationFlow(api, {
      editor,
      projectId: "p",
      resourceId: "r",
      body: "note",
      range: { from: 7, to: 12 },
    });
    expect(r.ok).toBe(true);
    expect(added).toHaveLength(1);
    expect(added[0].id).toMatch(V4);
  });

  it("addTextExcerptFlow makes a v4 id and calls the transport", async () => {
    stubNoRandomUUID();
    const editor = mount("Hello brave world");
    const { api, added } = recordingApi();
    const r = await addTextExcerptFlow(api, {
      editor,
      projectId: "p",
      resourceId: SOURCE,
      range: { from: 7, to: 12 },
      body: "",
      sourceName: "Diary",
    });
    expect(r.ok).toBe(true);
    expect(added[0].id).toMatch(V4);
  });

  it("addAttachmentExcerptFlow makes a v4 id and calls the transport", async () => {
    stubNoRandomUUID();
    const { api, added } = recordingApi();
    const r = await addAttachmentExcerptFlow(api, {
      projectId: "p",
      sourceId: SOURCE,
      attachmentId: ATT,
      locator: { type: "timestamp", value: "00:42" },
    });
    expect(r.ok).toBe(true);
    expect(added[0].id).toMatch(V4);
  });
});
