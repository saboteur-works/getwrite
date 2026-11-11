/** @vitest-environment jsdom */
/**
 * Feature 101, Task 21 (FR-19, OQ-12): paste rules for annotated text. Real
 * TipTap editors with the app's schema, the Task 20 recorder and the paste
 * extension; the sidecar side is the real annotation core over real files
 * (two text resources and one non-text resource), so the pasted body is
 * written, and validated, by the core. Paste is `view.pasteHTML`, which runs
 * prosemirror's paste path (`transformPastedHTML`, `transformPasted`).
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
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { writeSidecar } from "../../src/lib/models/sidecar";
import {
  addAnnotationCore,
  deleteAnnotationCore,
  listAnnotationsCore,
  updateAnnotationCore,
} from "../../src/lib/models/annotations-core";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import type { Annotation, MetadataValue } from "../../src/lib/models/types";
import { httpAnnotationsTransport } from "../../src/lib/api/annotations";
import { removeDirRetry } from "./helpers/fs-utils";

const T0 = "1970-01-01T00:00:00.000Z";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const BODY = "check this claim";

let batchRoot = "";
let projectId = "";
let projectRoot = "";
let res1 = "";
let res2 = "";
let resFile = "";
const originalProjectsDir = process.env.GETWRITE_PROJECTS_DIR;
const editors: Editor[] = [];

async function makeResource(type: string): Promise<string> {
  const id = generateUUID();
  await writeSidecar(projectRoot, id, {
    id,
    slug: "r",
    type,
    name: "R",
    orderIndex: 0,
    folderId: null,
    createdAt: T0,
    updatedAt: T0,
    wordCount: 4,
    userMetadata: {},
  } as Record<string, MetadataValue>);
  return id;
}

function sidecarPath(id: string): string {
  return path.join(projectRoot, "meta", `resource-${id}.meta.json`);
}

async function stored(id: string): Promise<Annotation[]> {
  return listAnnotationsCore(projectId, id);
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

interface Mounted {
  editor: Editor;
  add: ReturnType<typeof vi.fn<AnnotationPasteApi["add"]>>;
  results: AnnotationPasteResult[];
  settled: () => Promise<AnnotationPasteResult>;
}

function mount(resourceId: string | null, runs: JSONContent[]): Mounted {
  const results: AnnotationPasteResult[] = [];
  let wake: (() => void) | null = null;
  const add = vi.fn<AnnotationPasteApi["add"]>(addAnnotationCore);
  const api: AnnotationPasteApi = { list: listAnnotationsCore, add };
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
    content: { type: "doc", content: [{ type: "paragraph", content: runs }] },
  });
  editors.push(editor);
  return {
    editor,
    add,
    results,
    settled: () =>
      results.length > 0
        ? Promise.resolve(results[results.length - 1])
        : new Promise((resolve) => {
            wake = () => resolve(results[results.length - 1]);
          }),
  };
}

/** "plain " then "noted" (annotated A) then " tail". */
function source(resourceId: string): Mounted {
  return mount(resourceId, [run("plain "), run("noted", [A]), run(" tail")]);
}

function plainTarget(resourceId: string): Mounted {
  return mount(resourceId, [run("target text")]);
}

function select(editor: Editor, from: number, to: number): void {
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, from, to),
    ),
  );
}

/**
 * Fires a synthetic cut or copy. prosemirror schedules a 50 ms timer (it
 * applies a cut's deletion there), so the timers run now, under fake timers
 * that are switched off again before any file work.
 */
function fire(editor: Editor, type: "cut" | "copy"): void {
  vi.useFakeTimers();
  try {
    editor.view.dom.dispatchEvent(
      new Event(type, { bubbles: true, cancelable: true }),
    );
    vi.runAllTimers();
  } finally {
    vi.useRealTimers();
  }
}

/** The clipboard HTML prosemirror would write for the selection. */
function clipboardHtml(editor: Editor): string {
  return editor.view.serializeForClipboard(editor.state.selection.content()).dom
    .innerHTML;
}

/** Copies or cuts "noted" (positions 7 to 12) and returns its clipboard HTML. */
function takeNoted(m: Mounted, kind: "cut" | "copy"): string {
  select(m.editor, 7, 12);
  const html = clipboardHtml(m.editor);
  fire(m.editor, kind);
  return html;
}

function paste(m: Mounted, html: string): void {
  const end = m.editor.state.doc.content.size - 1;
  select(m.editor, end, end);
  // jsdom has no ClipboardEvent, which pasteHTML builds when given none.
  m.editor.view.pasteHTML(html, new Event("paste") as ClipboardEvent);
}

function annotationIds(editor: Editor): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => {
    for (const mark of node.marks) {
      if (mark.type.name === "annotation") ids.push(mark.attrs.id as string);
    }
  });
  return ids;
}

beforeEach(async () => {
  clearLastClipboardOperation();
  batchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-annot-paste-"));
  process.env.GETWRITE_PROJECTS_DIR = batchRoot;
  projectId = generateUUID();
  projectRoot = path.join(batchRoot, projectId);
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, PROJECT_FILENAME),
    JSON.stringify(createProject({ name: "annotation paste" })),
    "utf8",
  );
  res1 = await makeResource("text");
  res2 = await makeResource("text");
  resFile = await makeResource("image");
  await addAnnotationCore(projectId, res1, {
    id: A,
    body: BODY,
    quote: "noted",
  });
});

afterEach(async () => {
  for (const e of editors.splice(0)) e.destroy();
  await flushIndexer();
  if (originalProjectsDir === undefined)
    delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalProjectsDir;
  await removeDirRetry(batchRoot);
});

describe("copy-paste", () => {
  it("in the same resource: new id, copied body and quote, independent edit and delete", async () => {
    const m = source(res1);
    const html = takeNoted(m, "copy");
    paste(m, html);
    const result = await m.settled();

    expect(result).toEqual({ ok: true });
    const ids = annotationIds(m.editor);
    const fresh = ids.find((id) => id !== A);
    expect(ids).toContain(A);
    expect(fresh).toBeDefined();
    const list = await stored(res1);
    expect(list.map((a) => a.id).sort()).toEqual([A, fresh!].sort());
    const copy = list.find((a) => a.id === fresh)!;
    expect(copy.body).toBe(BODY);
    expect(copy.quote).toBe("noted");

    await updateAnnotationCore(projectId, res1, fresh!, "edited copy");
    expect((await stored(res1)).find((a) => a.id === A)!.body).toBe(BODY);
    await deleteAnnotationCore(projectId, res1, A);
    const after = await stored(res1);
    expect(after.map((a) => a.id)).toEqual([fresh]);
    expect(after[0].body).toBe("edited copy");
  });

  it("across resources: the target gets a new id and a copy; the source is untouched", async () => {
    const m = source(res1);
    const target = plainTarget(res2);
    const before = await fs.readFile(sidecarPath(res1), "utf8");
    paste(target, takeNoted(m, "copy"));
    expect(await target.settled()).toEqual({ ok: true });

    const [fresh] = annotationIds(target.editor);
    expect(fresh).not.toBe(A);
    expect(target.editor.getText()).toContain("noted");
    const copy = (await stored(res2)).find((a) => a.id === fresh)!;
    expect(copy.body).toBe(BODY);
    expect(copy.quote).toBe("noted");
    expect(await fs.readFile(sidecarPath(res1), "utf8")).toBe(before);

    await deleteAnnotationCore(projectId, res2, fresh);
    expect((await stored(res1)).map((a) => a.id)).toEqual([A]);
  });

  it("never shares an id between resources", async () => {
    const m = source(res1);
    const target = plainTarget(res2);
    paste(target, takeNoted(m, "copy"));
    await target.settled();
    const ids1 = (await stored(res1)).map((a) => a.id);
    const ids2 = (await stored(res2)).map((a) => a.id);
    expect(ids1.filter((id) => ids2.includes(id))).toEqual([]);
  });
});

describe("cut-paste", () => {
  it("in the same resource: same id and body, nothing copied", async () => {
    const m = source(res1);
    const before = await fs.readFile(sidecarPath(res1), "utf8");
    const html = takeNoted(m, "cut");
    expect(annotationIds(m.editor)).toEqual([]);
    paste(m, html);

    expect(annotationIds(m.editor)).toEqual([A]);
    expect(m.add).not.toHaveBeenCalled();
    expect(m.results).toEqual([]);
    expect(await fs.readFile(sidecarPath(res1), "utf8")).toBe(before);
  });

  it("in the same resource, pasted twice: the second paste is a copy with a new id", async () => {
    const m = source(res1);
    const html = takeNoted(m, "cut");
    paste(m, html);
    paste(m, html);
    await m.settled();

    const ids = annotationIds(m.editor);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toContain(A);
    expect(m.add).toHaveBeenCalledTimes(1);
    expect(await stored(res1)).toHaveLength(2);
  });

  it("of part of a passage, same resource: the id still in the document forces a copy", async () => {
    const m = source(res1);
    select(m.editor, 7, 10);
    const html = clipboardHtml(m.editor);
    fire(m.editor, "cut");
    expect(annotationIds(m.editor)).toEqual([A]);
    paste(m, html);
    await m.settled();

    const ids = annotationIds(m.editor);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(await stored(res1)).toHaveLength(2);
  });

  it("across resources: the target gets a new id and a copy; the source annotation is detached, not deleted", async () => {
    const m = source(res1);
    const target = plainTarget(res2);
    paste(target, takeNoted(m, "cut"));
    expect(await target.settled()).toEqual({ ok: true });

    // Source: the cut removed the text and its mark; the body stays.
    expect(annotationIds(m.editor)).toEqual([]);
    const sourceList = await stored(res1);
    expect(sourceList.map((a) => a.id)).toEqual([A]);
    expect(sourceList[0].body).toBe(BODY);
    // Target: a new id and a copy of body and quote.
    const [fresh] = annotationIds(target.editor);
    expect(fresh).not.toBe(A);
    const copy = (await stored(res2)).find((a) => a.id === fresh)!;
    expect(copy.body).toBe(BODY);
    expect(copy.quote).toBe("noted");
    expect((await stored(res2)).map((a) => a.id)).not.toContain(A);
  });
});

describe("paste from outside the app", () => {
  it("drops the mark and keeps the text when nothing was cut or copied here", async () => {
    const target = plainTarget(res2);
    paste(
      target,
      `<p>from elsewhere <span data-annotation-id="${A}">noted</span></p>`,
    );

    expect(target.editor.getText()).toContain("noted");
    expect(annotationIds(target.editor)).toEqual([]);
    expect(target.add).not.toHaveBeenCalled();
    expect(await stored(res2)).toEqual([]);
  });

  it("drops the mark when the pasted ids differ from the recorded ones (stale record)", async () => {
    const m = source(res1);
    takeNoted(m, "copy");
    const target = plainTarget(res2);
    paste(target, `<p><span data-annotation-id="${B}">other</span></p>`);

    expect(target.editor.getText()).toContain("other");
    expect(annotationIds(target.editor)).toEqual([]);
    expect(target.add).not.toHaveBeenCalled();
  });

  it("drops the mark in an editor with no resource id", () => {
    const m = source(res1);
    const html = takeNoted(m, "copy");
    const target = mount(null, [run("target text")]);
    paste(target, html);

    expect(target.editor.getText()).toContain("noted");
    expect(annotationIds(target.editor)).toEqual([]);
    expect(target.add).not.toHaveBeenCalled();
  });
});

describe("the pasted body", () => {
  it("comes from the source sidecar through the core, never from the clipboard", async () => {
    const m = source(res1);
    const target = plainTarget(res2);
    const html = takeNoted(m, "copy").replace(
      `data-annotation-id="${A}"`,
      `data-annotation-id="${A}" data-annotation-body="forged" data-body="forged"`,
    );
    paste(target, html);
    await target.settled();

    expect(target.add).toHaveBeenCalledTimes(1);
    const input = target.add.mock.calls[0][2];
    expect(input.body).toBe(BODY);
    expect(JSON.stringify(await stored(res2))).not.toContain("forged");
  });

  it("is validated by the core: a refused write removes the new mark and reports the message", async () => {
    const m = source(res1);
    const target = mount(resFile, [run("target text")]);
    paste(target, takeNoted(m, "copy"));
    const result = await target.settled();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
    expect(annotationIds(target.editor)).toEqual([]);
    expect(target.editor.getText()).toContain("noted");
  });

  it("with no source body (a detached or missing one) removes the new mark and reports it", async () => {
    const m = source(res1);
    const html = takeNoted(m, "copy");
    await deleteAnnotationCore(projectId, res1, A);
    const target = plainTarget(res2);
    paste(target, html);
    const result = await target.settled();

    expect(result.ok).toBe(false);
    expect(target.add).not.toHaveBeenCalled();
    expect(annotationIds(target.editor)).toEqual([]);
    expect(target.editor.getText()).toContain("noted");
  });
});

const SRC = "33333333-3333-4333-8333-333333333333";
const CLAIM_DATE = "2026-01-02T03:04:05.000Z";

/** Writes a claim (status, date and Source link set) straight into res1's sidecar. */
async function seedClaim(status: string, date: string): Promise<void> {
  const sidecar = JSON.parse(await fs.readFile(sidecarPath(res1), "utf8"));
  sidecar.annotations = [
    {
      ...sidecar.annotations[0],
      target: { sourceId: SRC, sourceName: "Interview" },
      claim: { status, statusChangedAt: date },
    },
  ];
  await fs.writeFile(sidecarPath(res1), JSON.stringify(sidecar), "utf8");
}

describe("addAnnotationCore with a carried claim (Feature 108, FR-18)", () => {
  const base = { body: "stmt", quote: "q" };

  it("stores a valid carried claim unchanged", async () => {
    const claim = { status: "disputed", statusChangedAt: CLAIM_DATE };
    const added = await addAnnotationCore(projectId, res2, {
      id: B,
      ...base,
      target: { sourceId: SRC },
      claim,
    });
    expect(added.claim).toEqual(claim);
    const [read] = await stored(res2);
    expect(read.claim).toEqual(claim);
    expect(read.target).toEqual({ sourceId: SRC });
  });

  it("refuses an invalid carried claim and writes nothing", async () => {
    const bad: unknown[] = [
      { status: "verified" },
      { status: "", statusChangedAt: CLAIM_DATE },
      { status: 5, statusChangedAt: CLAIM_DATE },
      { status: "x".repeat(65), statusChangedAt: CLAIM_DATE },
      { status: "verified", statusChangedAt: "yesterday" },
      { status: "verified", statusChangedAt: CLAIM_DATE, extra: 1 },
      "verified",
    ];
    for (const claim of bad) {
      await expect(
        addAnnotationCore(projectId, res2, { id: B, ...base, claim }),
      ).rejects.toThrow();
    }
    expect(await stored(res2)).toEqual([]);
  });

  it("refuses a claim with an empty statement and still refuses unknown keys", async () => {
    const claim = { status: "verified", statusChangedAt: CLAIM_DATE };
    await expect(
      addAnnotationCore(projectId, res2, {
        id: B,
        body: "",
        quote: "q",
        claim,
      }),
    ).rejects.toThrow();
    await expect(
      addAnnotationCore(projectId, res2, { id: B, ...base, other: 1 }),
    ).rejects.toThrow();
    expect(await stored(res2)).toEqual([]);
  });

  it("adds an annotation with no claim exactly as before", async () => {
    const added = await addAnnotationCore(projectId, res2, { id: B, ...base });
    expect("claim" in added).toBe(false);
  });
});

describe("paste of a claim (Feature 108, FR-18)", () => {
  it("keeps status, status date and Source link in the stored sidecar", async () => {
    await seedClaim("verified", CLAIM_DATE);
    const m = source(res1);
    const target = plainTarget(res2);
    paste(target, takeNoted(m, "copy"));
    expect(await target.settled()).toEqual({ ok: true });

    expect(target.add).toHaveBeenCalledTimes(1);
    expect(target.add.mock.calls[0][2].claim).toEqual({
      status: "verified",
      statusChangedAt: CLAIM_DATE,
    });
    const [copy] = await stored(res2);
    expect(copy.id).not.toBe(A);
    expect(copy.body).toBe(BODY);
    expect(copy.claim).toEqual({
      status: "verified",
      statusChangedAt: CLAIM_DATE,
    });
    expect(copy.target).toEqual({ sourceId: SRC, sourceName: "Interview" });
  });

  it("sends no claim key for a plain annotation", async () => {
    const m = source(res1);
    const target = plainTarget(res2);
    paste(target, takeNoted(m, "copy"));
    await target.settled();
    expect("claim" in target.add.mock.calls[0][2]).toBe(false);
    expect("claim" in (await stored(res2))[0]).toBe(false);
  });

  it("carries a stored status that is off the list as stored (OQ-11); the source keeps it too", async () => {
    await seedClaim("from-a-newer-build", CLAIM_DATE);
    const m = source(res1);
    const target = plainTarget(res2);
    paste(target, takeNoted(m, "copy"));
    const result = await target.settled();

    expect(result.ok).toBe(true);
    expect(annotationIds(target.editor)).toHaveLength(1);
    expect((await stored(res2))[0].claim).toEqual({
      status: "from-a-newer-build",
      statusChangedAt: CLAIM_DATE,
    });
    expect((await stored(res1))[0].claim?.status).toBe("from-a-newer-build");
  });
});

describe("client annotation parse (Feature 108, FR-18)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the claim key from add and list, and nothing extra for a plain note", async () => {
    const claim = { status: "needs-review", statusChangedAt: CLAIM_DATE };
    const withClaim = {
      id: A,
      body: "b",
      quote: "q",
      claim,
      createdAt: T0,
      updatedAt: T0,
    };
    const plain = {
      id: B,
      body: "b",
      quote: "q",
      createdAt: T0,
      updatedAt: T0,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              annotation: withClaim,
              annotations: [withClaim, plain],
            }),
            { status: 200 },
          ),
      ),
    );
    const added = await httpAnnotationsTransport.add("p", "r", {
      id: A,
      body: "b",
      quote: "q",
      claim,
    });
    expect(added.claim).toEqual(claim);
    const listed = await httpAnnotationsTransport.list("p", "r");
    expect(listed[0].claim).toEqual(claim);
    expect(JSON.stringify(listed[1])).toBe(JSON.stringify(plain));
  });
});
