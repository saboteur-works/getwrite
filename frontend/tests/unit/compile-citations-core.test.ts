/**
 * Feature 116, Task 43 (FR-10, FR-11, FR-12, FR-13, FR-16, FR-17): the
 * citations pass wired into `compilePdfCore` and `compileDocxCore`.
 *
 * With the option present both cores read the TipTap document, run the render
 * pass (Task 38), the incomplete marker (Task 39) and the bibliography
 * (Task 40), and render through the DOCX and PDF documents (Tasks 41 and 42).
 * With the option absent the Task 24 seam is not entered.
 *
 * Page placement is checked by ordered per-page extracted text (`pdfjs-dist`,
 * a test-only helper) and by react-pdf layout boxes captured through
 * `onRender`. Layout boxes are not glyph positions: this file does not measure
 * whether glyphs overlap, only whether the footer box and the body box do.
 */
// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import React from "react";
import JSZip from "jszip";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import {
  compileDocxCore,
  compilePdfCore,
  compileWithCitations,
  PDF_NOTE_LAYOUT_MAX_PASSES,
  registerCitationsPass,
  type CompileCitationsPass,
} from "../../src/lib/models/compile-core";
import {
  renderPdfOnServer,
  type PdfRenderer,
} from "../../src/lib/export/pdf-render";
import type { CompileBody } from "../../src/lib/export/types";
import {
  checkCitationsCore,
  requiredDetailsCheck,
} from "../../src/lib/models/citations-precheck-core";
import { renderCitations } from "../../src/lib/citations/citation-engine";
import { loadBundledStyle } from "../../src/lib/citations/style-loader";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { writeSidecar } from "../../src/lib/models/sidecar";
import * as io from "../../src/lib/models/io";
import type { StorageAdapter } from "../../src/lib/models/io";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import {
  runInStorageContext,
  type StorageContext,
} from "../../src/lib/models/storage-context";
import { createKeyring } from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { generateUUID } from "../../src/lib/models/uuid";
import { tiptapToPlainText } from "../../src/lib/tiptap-text";
import type {
  Annotation,
  MetadataValue,
  TipTapDocument,
  TipTapNode,
} from "../../src/lib/models/types";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";
import { extractPdfPageTexts } from "../helpers/pdf-text";
import { removeDirRetry } from "./helpers/fs-utils";

vi.mock("../../src/lib/citations/style-loader", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/lib/citations/style-loader")
    >();
  return { ...actual, loadBundledStyle: vi.fn(actual.loadBundledStyle) };
});

vi.mock("../../src/lib/citations/citation-engine", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/lib/citations/citation-engine")
    >();
  return { ...actual, renderCitations: vi.fn(actual.renderCitations) };
});

const STYLE_ID = "chicago-notes-bibliography";
const T0 = "1970-01-01T00:00:00.000Z";
const OPTION = { styleId: STYLE_ID };

let batchRoot = "";
let projectId = "";
let projectRoot = "";
const originalProjectsDir = process.env.GETWRITE_PROJECTS_DIR;

beforeEach(async () => {
  batchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-cite-core-"));
  process.env.GETWRITE_PROJECTS_DIR = batchRoot;
  projectId = generateUUID();
  projectRoot = path.join(batchRoot, projectId);
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, PROJECT_FILENAME),
    JSON.stringify(createProject({ name: "cite" })),
    "utf8",
  );
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (originalProjectsDir === undefined) {
    delete process.env.GETWRITE_PROJECTS_DIR;
  } else {
    process.env.GETWRITE_PROJECTS_DIR = originalProjectsDir;
  }
  await removeDirRetry(batchRoot);
});

// ---------------------------------------------------------------- fixtures

function text(value: string, markId?: string): TipTapNode {
  return markId === undefined
    ? { type: "text", text: value }
    : {
        type: "text",
        text: value,
        marks: [{ type: "annotation", attrs: { id: markId } }],
      };
}

function doc(...paragraphs: TipTapNode[][]): TipTapDocument {
  return {
    type: "doc",
    content: paragraphs.map((content) => ({ type: "paragraph", content })),
  };
}

function citing(id: string, sourceId: string, sourceName?: string): Annotation {
  return {
    id,
    body: "",
    quote: "a passage",
    createdAt: T0,
    updatedAt: T0,
    target: { sourceId, ...(sourceName === undefined ? {} : { sourceName }) },
  };
}

async function addResource(
  root: string,
  name: string,
  type: "text" | "source",
  extra: Record<string, unknown>,
  document?: TipTapDocument,
): Promise<string> {
  const id = generateUUID();
  await writeSidecar(root, id, {
    id,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    type,
    name,
    orderIndex: 0,
    folderId: null,
    createdAt: T0,
    updatedAt: T0,
    ...extra,
  } as Record<string, MetadataValue>);
  const dir = `${root}/resources/${id}`;
  await io.mkdir(dir, { recursive: true });
  if (document !== undefined) {
    await io.writeFile(
      `${dir}/content.tiptap.json`,
      JSON.stringify(document),
      "utf8",
    );
    await io.writeFile(
      `${dir}/content.txt`,
      tiptapToPlainText(document),
      "utf8",
    );
  }
  return id;
}

function bookFields(given: string, family: string, title: string): unknown {
  return {
    referenceType: "book",
    authors: [{ given, family }],
    title,
    publisher: "Penguin",
    place: "London",
    date: "1999",
  };
}

const addSource = (
  name: string,
  citationFields?: unknown,
  root: string = projectRoot,
): Promise<string> =>
  addResource(
    root,
    name,
    "source",
    citationFields === undefined ? {} : { citationFields },
  );

const addText = (
  name: string,
  document: TipTapDocument,
  annotations: Annotation[],
  root: string = projectRoot,
): Promise<string> =>
  addResource(root, name, "text", { annotations }, document);

function bodyFor(
  ids: readonly string[],
  names: readonly string[] = [],
  id: string = projectId,
): CompileBody {
  return {
    projectId: id,
    resourceIds: [...ids],
    resources: ids.map((rid, i) => ({
      id: rid,
      name: names[i] ?? `Chapter ${i + 1}`,
      type: "text",
    })),
    includeHeaders: true,
    projectName: "Book",
    citations: OPTION,
  };
}

interface Unzipped {
  doc: string;
  footnotes: string | undefined;
  names: string[];
}

async function unzip(buffer: ArrayBuffer): Promise<Unzipped> {
  const zip = await JSZip.loadAsync(buffer);
  return {
    doc: (await zip.file("word/document.xml")?.async("string")) ?? "",
    footnotes: await zip.file("word/footnotes.xml")?.async("string"),
    names: Object.keys(zip.files).sort(),
  };
}

function squash(s: string): string {
  return s.replace(/\s+/g, "");
}

// -------------------------------------------------------------------- DOCX

describe("compileDocxCore with the citations option", () => {
  it("reads the TipTap document, anchors a Word footnote after the mark and ends with the bibliography", async () => {
    const src = await addSource(
      "Ledger",
      bookFields("Jane", "Smith", "The Ledger"),
    );
    const markId = generateUUID();
    const chapter = await addText(
      "Chapter",
      doc([text("Before "), text("the claim", markId), text(" after.")]),
      [citing(markId, src)],
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const out = await unzip(
      (await compileDocxCore(bodyFor([chapter]))).arrayBuffer,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(out.footnotes).toBeDefined();
    expect(out.footnotes).toContain("Jane Smith");
    expect(out.footnotes).toContain("Ledger");
    // Title formatting runs reach the note.
    expect(out.footnotes).toMatch(/<w:i\b/);
    expect(out.doc.match(/<w:footnoteReference /g)).toHaveLength(1);
    // The cited passage is unchanged and the note sits right after it.
    expect(out.doc).toMatch(
      /Before the claim<\/w:t>[\s\S]*?<w:footnoteReference [\s\S]*?after\./,
    );
    // The bibliography follows the manuscript with its heading.
    expect(out.doc.indexOf("Bibliography")).toBeGreaterThan(
      out.doc.indexOf("after."),
    );
    expect(out.doc.indexOf("Smith")).toBeGreaterThan(
      out.doc.indexOf("Bibliography"),
    );
  });

  it("maps an anchor to the builders' UTF-16 offset after a multi-byte character and a surrogate pair", async () => {
    const src = await addSource(
      "Ledger",
      bookFields("Jane", "Smith", "The Ledger"),
    );
    const a = generateUUID();
    const b = generateUUID();
    const chapter = await addText(
      "Chapter",
      doc(
        [text("é日本😀 first ")],
        [text("x😀é "), text("marked one", a), text(" mid "), text("two", b)],
      ),
      [citing(a, src), citing(b, src)],
    );
    const out = await unzip(
      (await compileDocxCore(bodyFor([chapter]))).arrayBuffer,
    );
    // The reference sits directly after the marked text, not shifted by the
    // difference between code points, UTF-8 bytes and UTF-16 units.
    expect(out.doc).toMatch(
      /x😀é marked one<\/w:t><\/w:r><w:r>(?:(?!<w:t)[\s\S])*?<w:footnoteReference [^>]*\/>(?:(?!<w:t)[\s\S])*?<w:t[^>]*> mid two/,
    );
    expect(out.doc.match(/<w:footnoteReference /g)).toHaveLength(2);
  });

  it("places the note after punctuation that directly follows the mark", async () => {
    const src = await addSource(
      "Ledger",
      bookFields("Jane", "Smith", "The Ledger"),
    );
    const a = generateUUID();
    const chapter = await addText(
      "Chapter",
      doc([text("A claim", a), text(". Next sentence.")]),
      [citing(a, src)],
    );
    const out = await unzip(
      (await compileDocxCore(bodyFor([chapter]))).arrayBuffer,
    );
    expect(out.doc).toMatch(
      /A claim\.<\/w:t>[\s\S]*?<w:footnoteReference [\s\S]*?Next sentence\./,
    );
  });

  it("renders the FR-16 marker for a removed Source, a Source missing a detail and a Source with no fields", async () => {
    const removedId = generateUUID();
    const missing = await addSource("Gap Source", {
      referenceType: "book",
      title: "Only a title",
    });
    const empty = await addSource("Empty Source");
    const [a, b, c, d] = [1, 2, 3, 4].map(() => generateUUID());
    const chapter = await addText(
      "Chapter",
      doc([
        text("one", a),
        text(" "),
        text("two", b),
        text(" "),
        text("three", c),
        text(" "),
        text("four", d),
      ]),
      [
        citing(a, removedId, "Removed Source"),
        citing(b, missing),
        citing(c, empty),
        citing(d, generateUUID()),
      ],
    );
    const out = await unzip(
      (await compileDocxCore(bodyFor([chapter]))).arrayBuffer,
    );
    expect(out.footnotes).toContain("[citation incomplete: Removed Source]");
    expect(out.footnotes).toContain("[citation incomplete: Gap Source]");
    expect(out.footnotes).toContain("[citation incomplete: Empty Source]");
    expect(out.footnotes).toContain("[citation incomplete: unnamed Source]");
    expect(out.doc.match(/<w:footnoteReference /g)).toHaveLength(4);
  });

  it("marks a Source with a stored invalid date as incomplete, never passes the value to the engine and leaves the sidecar unchanged (Task 65, OQ-18)", async () => {
    const stored = {
      referenceType: "interview",
      interviewee: [{ family: "Doe", given: "Jo" }],
      interviewer: [{ family: "Roe", given: "Al" }],
      date: "2005-01-55",
      accessed: undefined,
    };
    const bad = await addSource("Interview Source", stored);
    const good = await addSource("Good Source", bookFields("A", "Author", "T"));
    const [a, b] = [1, 2].map(() => generateUUID());
    const chapter = await addText(
      "Chapter",
      doc([text("one", a), text(" "), text("two", b)]),
      [citing(a, bad), citing(b, good)],
    );
    const badFile = `${projectRoot}/meta/resource-${bad}.meta.json`;
    const before = await fs.readFile(badFile, "utf8");
    const mocked = renderCitations as unknown as MockInstance;
    mocked.mockClear();
    const check = await checkCitationsCore(projectId, [chapter], {
      missingDetails: requiredDetailsCheck(STYLE_ID),
    });
    const out = await unzip(
      (await compileDocxCore(bodyFor([chapter]))).arrayBuffer,
    );
    expect(check).toMatchObject({
      status: "ok",
      gaps: [
        { kind: "missing-detail", sourceId: bad, missingDetails: ["Date"] },
      ],
    });
    expect(out.footnotes).toContain("[citation incomplete: Interview Source]");
    expect(out.footnotes).not.toContain("[citation incomplete: Good Source]");
    expect(mocked.mock.calls.length).toBeGreaterThan(0);
    const passed = JSON.stringify(mocked.mock.calls);
    expect(passed).not.toContain("2005-01-55");
    expect(passed).not.toContain("2005,1,55");
    expect(passed).not.toContain("2005");
    expect(out.doc + (out.footnotes ?? "")).not.toContain("2005-01-55");
    expect(await fs.readFile(badFile, "utf8")).toBe(before);
  });

  it("adds no bibliography and no footnotes when no citation is placed", async () => {
    const chapter = await addText("Chapter", doc([text("Plain words.")]), []);
    const out = await unzip(
      (await compileDocxCore(bodyFor([chapter]))).arrayBuffer,
    );
    expect(out.doc).not.toContain("w:footnoteReference");
    expect(out.doc).not.toContain("Bibliography");
    expect(out.doc).toContain("Plain words.");
  });

  it("refuses when a citation's mark is not in the document, naming its resource and Source", async () => {
    const src = await addSource(
      "Lost Mark Source",
      bookFields("Jane", "Smith", "The Ledger"),
    );
    const chapter = await addText(
      "Detached Chapter",
      doc([text("No mark here.")]),
      [citing(generateUUID(), src)],
    );
    const err = await compileDocxCore(bodyFor([chapter])).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message).toContain("Detached Chapter");
    expect(message).toContain("Lost Mark Source");
  });

  it("does not render a citation in a resource that is not compiled", async () => {
    const src = await addSource(
      "Ledger",
      bookFields("Jane", "Smith", "The Ledger"),
    );
    const a = generateUUID();
    const left = await addText("Left out", doc([text("claim", a)]), [
      citing(a, src),
    ]);
    const kept = await addText("Kept", doc([text("Plain.")]), []);
    const body = bodyFor([kept]);
    body.resources.push({ id: left, name: "Left out", type: "text" });
    const out = await unzip((await compileDocxCore(body)).arrayBuffer);
    expect(out.doc).not.toContain("w:footnoteReference");
    expect(out.doc).not.toContain("Bibliography");
  });
});

// ---------------------------------------------------------------- the seam

describe("the Task 24 seam", () => {
  it("is not entered when the option is absent", async () => {
    const chapter = await addText("Chapter", doc([text("Plain words.")]), []);
    const spy = vi.fn<CompileCitationsPass>(async () => ({
      arrayBuffer: new Uint8Array([1]).buffer,
    }));
    registerCitationsPass(spy);
    try {
      const body = bodyFor([chapter]);
      delete body.citations;
      const out = await unzip((await compileDocxCore(body)).arrayBuffer);
      await compilePdfCore(body);
      expect(spy).not.toHaveBeenCalled();
      expect(out.doc).not.toContain("w:footnoteReference");
      expect(out.doc).toContain("Plain words.");
    } finally {
      registerCitationsPass(compileWithCitations);
    }
  });
});

// ------------------------------------------------------------ failure paths

describe.each([
  ["docx", (b: CompileBody) => compileDocxCore(b)],
  ["pdf", (b: CompileBody) => compilePdfCore(b)],
] as const)(
  "%s: failures fail the compile and name what failed",
  (_name, compile) => {
    async function citedChapter(): Promise<{ chapter: string; src: string }> {
      const src = await addSource(
        "Ledger",
        bookFields("Jane", "Smith", "The Ledger"),
      );
      const a = generateUUID();
      const chapter = await addText("Chapter", doc([text("claim", a)]), [
        citing(a, src),
      ]);
      return { chapter, src };
    }

    it("a Source that cannot be read", async () => {
      const { chapter, src } = await citedChapter();
      const base = io.getStorageAdapter();
      const failing: StorageAdapter = {
        ...base,
        readFile: (p, e) =>
          p.endsWith(`resource-${src}.meta.json`)
            ? Promise.reject(Object.assign(new Error("EIO"), { code: "EIO" }))
            : base.readFile(p, e),
      };
      io.setStorageAdapter(failing);
      try {
        await expect(compile(bodyFor([chapter]))).rejects.toThrow(
          /Source cited in the compiled resources could not be read/,
        );
      } finally {
        io.setStorageAdapter(base);
      }
    });

    it("a sidecar of a compiled resource that cannot be read", async () => {
      const { chapter } = await citedChapter();
      const base = io.getStorageAdapter();
      const failing: StorageAdapter = {
        ...base,
        readFile: (p, e) =>
          p.endsWith(`resource-${chapter}.meta.json`)
            ? Promise.reject(Object.assign(new Error("EIO"), { code: "EIO" }))
            : base.readFile(p, e),
      };
      io.setStorageAdapter(failing);
      try {
        await expect(compile(bodyFor([chapter]))).rejects.toThrow(
          /sidecar of a compiled resource could not be read/,
        );
      } finally {
        io.setStorageAdapter(base);
      }
    });

    it("a style that cannot be loaded", async () => {
      const { chapter } = await citedChapter();
      vi.mocked(loadBundledStyle).mockResolvedValueOnce({
        ok: false,
        reason: "load-failed",
        failed: "style",
        message: "The citation style could not be loaded.",
      });
      await expect(compile(bodyFor([chapter]))).rejects.toThrow(
        /citation style could not be loaded/,
      );
    });

    it("an engine failure", async () => {
      const { chapter } = await citedChapter();
      (renderCitations as unknown as MockInstance).mockReturnValueOnce({
        ok: false,
        stage: "render",
        message: "boom",
      });
      await expect(compile(bodyFor([chapter]))).rejects.toThrow(
        /citation engine failed while rendering citations \(render\)/,
      );
    });

    it("a bibliography engine failure", async () => {
      const { chapter } = await citedChapter();
      const mocked = renderCitations as unknown as MockInstance;
      // First call (the citations) runs the real engine; the second (the
      // bibliography) fails. Once-only, so nothing leaks into later tests.
      const real = mocked.getMockImplementation();
      mocked.mockImplementationOnce(real as (...a: unknown[]) => unknown);
      mocked.mockReturnValueOnce({
        ok: false,
        stage: "render",
        message: "boom",
      });
      await expect(compile(bodyFor([chapter]))).rejects.toThrow(
        /citation engine failed while building the bibliography/,
      );
    });
  },
);

describe("a locked project", () => {
  it("raises the locked-access error, never a failed or empty result", async () => {
    const workspace = "/ws";
    const base = createMemoryAdapter();
    const encId = generateUUID();
    const encRoot = `${workspace}/${encId}`;
    await base.mkdir(encRoot, { recursive: true });
    const keyring = await createKeyring(
      "correct horse battery staple",
      TEST_ARGON2_PARAMS,
    );
    await keyring.addProject(encId);
    await writeProjectMarker(encRoot, base);
    const ctx: StorageContext = {
      tenantRoot: workspace,
      adapter: workspaceEncryptionAdapter(base, workspace, keyring),
      projectRoot: encRoot,
    };
    const chapter = await runInStorageContext(ctx, async () => {
      await io.writeFile(
        `${encRoot}/${PROJECT_FILENAME}`,
        JSON.stringify(createProject({ name: "enc" })),
        "utf8",
      );
      return addText("Sealed", doc([text("x")]), [], encRoot);
    });
    keyring.lock();
    await expect(
      runInStorageContext(ctx, () =>
        compileDocxCore(bodyFor([chapter], [], encId)),
      ),
    ).rejects.toSatisfy((err: unknown) => isLockedAccessError(err));
  });
});

// --------------------------------------------------------------------- PDF

const FILLER =
  "The quick brown fox jumps over the lazy dog while the river keeps running past the old mill and the writers argue about commas. ";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

interface Corpus {
  chapters: string[];
  noteCount: number;
}

/**
 * The Task 57 corpus: 3 resources of 8 paragraphs, each ending in a cited
 * sentence, with a long (tall) first-citation note for each Source.
 */
async function buildTallCorpus(tall: boolean): Promise<Corpus> {
  const chapters: string[] = [];
  let n = 0;
  for (let c = 0; c < 3; c += 1) {
    const paragraphs: TipTapNode[][] = [];
    const annotations: Annotation[] = [];
    for (let p = 0; p < 8; p += 1) {
      n += 1;
      const title = tall
        ? `Ledger ${pad(n)} ${"Long note sentence for height. ".repeat(14)}`
        : `Ledger ${pad(n)}`;
      const src = await addSource(
        `Source ${pad(n)}`,
        bookFields(`G${pad(n)}`, `F${pad(n)}`, title),
      );
      const markId = generateUUID();
      annotations.push(citing(markId, src));
      paragraphs.push([
        text(FILLER.repeat(6)),
        text(`Claim ${pad(n)} ends here.`, markId),
      ]);
    }
    chapters.push(
      await addText(`Chapter ${c + 1}`, doc(...paragraphs), annotations),
    );
  }
  return { chapters, noteCount: n };
}

interface LayoutNode {
  type: string;
  box: { top: number; height: number };
  props?: { fixed?: boolean };
  children?: LayoutNode[];
}

interface Captured {
  layouts: LayoutNode[];
  calls: number;
}

/** A renderer that also records every pass's layout data; `alter` may change what the core sees. */
function capturingRenderer(
  captured: Captured,
  alter?: (call: number, layout: LayoutNode) => LayoutNode | undefined,
): PdfRenderer {
  return (element) => {
    captured.calls += 1;
    const call = captured.calls;
    const original = (
      element.props as { onRender?: (arg: Record<string, unknown>) => void }
    ).onRender;
    const wrapped = React.cloneElement(
      element as React.ReactElement<Record<string, unknown>>,
      {
        onRender: (arg: Record<string, unknown>) => {
          const layout = arg._INTERNAL__LAYOUT__DATA_ as LayoutNode;
          captured.layouts.push(layout);
          const seen = alter === undefined ? layout : alter(call, layout);
          if (seen === undefined) return;
          original?.({ ...arg, _INTERNAL__LAYOUT__DATA_: seen });
        },
      },
    );
    return renderPdfOnServer(wrapped as never);
  };
}

/**
 * Index of the page holding the reference mark of note `k` (squashed page
 * texts). The mark is the number glued to "here."; a sentence that wraps
 * across a page break puts "here." and the mark on the next page, which is
 * where the mark is drawn.
 */
function markPageIndex(pages: readonly string[], k: number): number {
  const whole = `Claim${pad(k)}endshere.${k}`;
  const found = pages.findIndex((p) => p.includes(whole));
  if (found >= 0) return found;
  // The sentence wrapped: the previous page ends mid-sentence ("Claim NN
  // ends") and this one begins with "here." and the mark.
  const before = `Claim${pad(k)}ends`;
  return pages.findIndex(
    (p, i) =>
      i > 0 &&
      p.startsWith(`here.${k}`) &&
      pages[i - 1].includes(before) &&
      !pages[i - 1].includes(`${before}here`),
  );
}

function lowestBottom(nodes: readonly LayoutNode[]): number {
  return Math.max(...nodes.map((n) => n.box.top + n.box.height));
}

describe("compilePdfCore with the citations option", () => {
  it("draws each note on the page of its mark and the bibliography at the end (short notes)", async () => {
    const corpus = await buildTallCorpus(false);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await compilePdfCore(bodyFor(corpus.chapters));
    expect(fetchSpy).not.toHaveBeenCalled();
    const pages = (await extractPdfPageTexts(result.arrayBuffer)).map(squash);
    const lastBibliography = pages
      .map((p) => p.includes("Bibliography"))
      .lastIndexOf(true);
    expect(lastBibliography).toBeGreaterThanOrEqual(0);
    let same = 0;
    for (let k = 1; k <= corpus.noteCount; k += 1) {
      const mark = markPageIndex(pages, k);
      const note = pages.findIndex((p) =>
        p.includes(squash(`G${pad(k)} F${pad(k)},`)),
      );
      if (mark >= 0 && mark === note) same += 1;
    }
    expect(same).toBe(corpus.noteCount);
  });

  it("tall notes: no footer box overlaps the body box on any page (layout boxes, not glyphs)", async () => {
    const corpus = await buildTallCorpus(true);
    const captured: Captured = { layouts: [], calls: 0 };
    const result = await compilePdfCore(
      bodyFor(corpus.chapters),
      capturingRenderer(captured),
    );
    // Reserving space changed the pagination, so the core rendered more than twice.
    expect(captured.layouts.length).toBeGreaterThanOrEqual(3);
    expect(captured.layouts.length).toBeLessThanOrEqual(
      PDF_NOTE_LAYOUT_MAX_PASSES,
    );
    console.info(
      `TASK43 tall corpus: ${captured.layouts.length} passes, pages per pass ${JSON.stringify(captured.layouts.map((l) => l.children?.length ?? 0))}`,
    );
    // Non-vacuity: with no room reserved (pass 2, the first with footers) a
    // footer box does reach into the body box, so the reservation is what
    // clears it in the final pass.
    const overlapsWithoutReserve = (captured.layouts[1].children ?? []).filter(
      (page) => {
        const kids = page.children ?? [];
        const footer = kids.find((k) => k.props?.fixed === true);
        const body = kids.filter((k) => k.props?.fixed !== true);
        return (
          footer !== undefined &&
          body.length > 0 &&
          footer.box.top < lowestBottom(body)
        );
      },
    );
    expect(overlapsWithoutReserve.length).toBeGreaterThan(0);
    const final = captured.layouts[captured.layouts.length - 1];
    const finalPages = final.children ?? [];
    let footersWithNotes = 0;
    finalPages.forEach((page, i) => {
      const kids = page.children ?? [];
      const footers = kids.filter((k) => k.props?.fixed === true);
      const body = kids.filter((k) => k.props?.fixed !== true);
      expect(footers).toHaveLength(1);
      if (footers[0].box.height > 0) footersWithNotes += 1;
      if (body.length > 0) {
        expect(
          footers[0].box.top,
          `page ${i + 1}: footer top against body bottom`,
        ).toBeGreaterThanOrEqual(lowestBottom(body));
      }
    });
    expect(footersWithNotes).toBeGreaterThan(3);
    // The PDF returned is the one whose layout was checked, and every note is
    // on the page of its mark.
    const pages = (await extractPdfPageTexts(result.arrayBuffer)).map(squash);
    expect(pages).toHaveLength(finalPages.length);
    const notOnMarkPage: { k: number; mark: number; note: number }[] = [];
    for (let k = 1; k <= corpus.noteCount; k += 1) {
      const mark = markPageIndex(pages, k);
      const note = pages.findIndex((p) =>
        p.includes(squash(`G${pad(k)} F${pad(k)},`)),
      );
      if (mark < 0 || mark !== note) notOnMarkPage.push({ k, mark, note });
    }
    expect(notOnMarkPage).toEqual([]);
  }, 120_000);

  it("fails naming both page counts when pass 2 has a different page count from pass 1", async () => {
    const corpus = await buildTallCorpus(false);
    const captured: Captured = { layouts: [], calls: 0 };
    const renderer = capturingRenderer(captured, (call, layout) =>
      call === 2
        ? {
            ...layout,
            children: [...(layout.children ?? []), (layout.children ?? [])[0]],
          }
        : layout,
    );
    const err = await compilePdfCore(bodyFor(corpus.chapters), renderer).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    const pass1Pages = captured.layouts[0].children?.length ?? 0;
    expect((err as Error).message).toContain(`${pass1Pages} pages`);
    expect((err as Error).message).toContain(`${pass1Pages + 1} pages`);
  }, 60_000);

  it("fails naming the bound when the notes never settle on stable pages", async () => {
    const corpus = await buildTallCorpus(false);
    const captured: Captured = { layouts: [], calls: 0 };
    // From pass 2 on, rotate the pages so every pass finds each mark on a
    // different page from the one the footers were drawn for.
    const renderer = capturingRenderer(captured, (call, layout) => {
      if (call < 2) return layout;
      const pages = layout.children ?? [];
      const shift = call % pages.length || 1;
      return {
        ...layout,
        children: [...pages.slice(shift), ...pages.slice(0, shift)],
      };
    });
    const err = await compilePdfCore(bodyFor(corpus.chapters), renderer).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("PDF_NOTE_LAYOUT_MAX_PASSES");
    expect((err as Error).message).toContain(
      String(PDF_NOTE_LAYOUT_MAX_PASSES),
    );
    expect(captured.calls).toBe(PDF_NOTE_LAYOUT_MAX_PASSES);
  }, 120_000);

  it("fails when the layout data is missing, never placing notes blind", async () => {
    const corpus = await buildTallCorpus(false);
    const captured: Captured = { layouts: [], calls: 0 };
    const renderer = capturingRenderer(captured, () => undefined);
    await expect(
      compilePdfCore(bodyFor(corpus.chapters), renderer),
    ).rejects.toThrow(/layout data/i);
  }, 60_000);

  it("fails naming the note when its reference mark is not in the layout", async () => {
    const corpus = await buildTallCorpus(false);
    const captured: Captured = { layouts: [], calls: 0 };
    const renderer = capturingRenderer(captured, () => ({
      type: "DOCUMENT",
      box: { top: 0, height: 0 },
      children: [],
    }));
    await expect(
      compilePdfCore(bodyFor(corpus.chapters), renderer),
    ).rejects.toThrow(/reference mark of note 1 was not found/);
  }, 60_000);
});
