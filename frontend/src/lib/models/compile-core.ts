// Last Updated: 2026-07-26

/**
 * @module compile-core
 *
 * **ADR-021 Phase 2 (Task 5) — transport-agnostic compile core.** The
 * business logic behind the four `/api/compile/*` routes
 * (`app/api/compile/pdf/route.ts`, `docx/route.ts`, `text/route.ts`,
 * `markdown/route.ts`), lifted so it can be reused by both the HTTP routes
 * (web/desktop) and the native in-process transport
 * (`store/transport/native-compile-backend.ts`) with byte-for-byte
 * identical rendering behavior.
 *
 * This module has no `next`/`NextRequest`/`NextResponse` import and never
 * constructs a `Response` or sets an HTTP header. Per FR1, each function
 * returns the **same normalized shape `lib/api/compile.ts`'s client-side
 * functions already parse HTTP responses into** (`PdfCompileResult` /
 * `DocxCompileResult` / `TextCompileResult` / `MarkdownCompileResult` —
 * mirrored below as `CompilePdfCoreResult` etc., so this module stays
 * layered under `lib/api/*` rather than importing from it): an `ArrayBuffer`
 * (or `text`/`markdown` string) plus `filename`, with no
 * `Content-Type`/`Content-Disposition`/`X-Compile-Warning` header dance at
 * all. The HTTP routes wrap these results back into the existing
 * header-bearing `Response`/`NextResponse.json` shape; the native backend
 * returns them directly.
 *
 * `projectId` resolution and validation is handled here (not left to
 * callers), throwing the shared `InvalidProjectIdCoreError` (imported from
 * `project-crud-core.ts` rather than re-declared) when `projectId` is not a
 * well-formed UUID — the route maps that to `respondInvalidProjectId()`;
 * the native backend lets it propagate.
 */
import nodeUrl from "node:url";
import { readFile } from "node:fs/promises";
import React from "react";
import { Page, type DocumentProps } from "@react-pdf/renderer";
import {
  CompilePDFDocument,
  registerIBMPlexFonts,
  type CompilePDFDocumentProps,
  type PdfNote,
  type PdfNotePlacement,
} from "../export/CompilePDFDocument";
import { renderPdfOnServer, type PdfRenderer } from "../export/pdf-render";
import { CompilePDFFallbackDocument } from "../export/CompilePDFFallbackDocument";
import {
  buildDocxDocument,
  Packer,
  type DocxCitationsInput,
} from "../export/CompileDocxDocument";
import { compileToText, type CompileSection } from "../export/compile-text";
import {
  compileToMarkdown,
  type MarkdownSection,
} from "../export/compile-markdown";
import {
  loadCitationSections,
  loadTextSections,
  readCitedSources,
  type CitationSectionInput,
} from "../export/section-loader";
import { slugify } from "../utils";
import { tiptapToPlainText } from "../tiptap-text";
import type { CompileBody, MarkdownConstructWarning } from "../export/types";
import {
  initCitationEngine,
  type CitationRun,
} from "../citations/citation-engine";
import { loadBundledStyle } from "../citations/style-loader";
import { buildBibliography } from "./citations-bibliography";
import { collectCitations } from "./citations-collect";
import { renderIncompleteCitation } from "./citations-incomplete";
import {
  renderCitationPass,
  type CitationRenderedSection,
} from "./citations-render";
import {
  BUNDLED_CITATION_STYLES,
  CITATIONS_FORMAT_UNAVAILABLE_REASON,
  UNNAMED_SOURCE_NAME,
  type CompileCitationsOption,
} from "./citations-types";
import type { TipTapDocument } from "./types";
import { InvalidProjectIdCoreError } from "./project-crud-core";
import { resolveProjectRoot } from "./project-root-resolver";

/** Result of {@link compilePdfCore} — mirrors `lib/api/compile.ts`'s `PdfCompileResult`. */
export interface CompilePdfCoreResult {
  arrayBuffer: ArrayBuffer;
  filename: string;
  warning?: string;
}

/** Result of {@link compileDocxCore} — mirrors `lib/api/compile.ts`'s `DocxCompileResult`. */
export interface CompileDocxCoreResult {
  arrayBuffer: ArrayBuffer;
  filename: string;
}

/** Result of {@link compileTextCore} — mirrors `lib/api/compile.ts`'s `TextCompileResult`. */
export interface CompileTextCoreResult {
  text: string;
  filename: string;
}

/** Result of {@link compileMarkdownCore} — mirrors `lib/api/compile.ts`'s `MarkdownCompileResult`. */
export interface CompileMarkdownCoreResult {
  markdown: string;
  filename: string;
  warnings: MarkdownConstructWarning[];
}

/**
 * Resolves `projectId` to its on-disk project directory, throwing
 * {@link InvalidProjectIdCoreError} (rather than returning a `Response`,
 * which the HTTP routes do via `resolveProjectPath`) when it is not a
 * well-formed UUID.
 */
function resolveProjectPathOrThrow(projectId: string): string {
  const projectPath = resolveProjectRoot(projectId);
  if (!projectPath) {
    throw new InvalidProjectIdCoreError(projectId);
  }
  return projectPath;
}

/** True when `err`'s message looks like a font-loading failure (network/404/etc). */
function isFontError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /font|fetch|404|network/i.test(msg);
}

/** Converts a Node `Buffer` to a standalone `ArrayBuffer` (never a view into a shared pool). */
function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

/** The citations option is malformed or names a style that is not bundled (FR-18). */
export class InvalidCitationsOptionError extends Error {
  constructor() {
    super("The citations option is not valid.");
    this.name = "InvalidCitationsOptionError";
  }
}

/** A citations compile was asked for but no engine pass is registered (FR-9). */
export class CitationsUnavailableError extends Error {
  constructor() {
    super("Citations are not available in this build.");
    this.name = "CitationsUnavailableError";
  }
}

/** The citations option was sent to a Markdown or text compile (FR-9). */
export class CitationsNotSupportedForFormatError extends Error {
  constructor() {
    super(CITATIONS_FORMAT_UNAVAILABLE_REASON);
    this.name = "CitationsNotSupportedForFormatError";
  }
}

/** What the citations pass receives; it replaces the whole PDF or DOCX render. */
export interface CompileCitationsRequest {
  format: "pdf" | "docx";
  body: CompileBody;
  option: CompileCitationsOption;
  projectPath: string;
  /** The PDF renderer the core was called with; unused for DOCX. */
  render?: PdfRenderer;
}

/** What the citations pass returns. */
export interface CompileCitationsPassResult {
  arrayBuffer: ArrayBuffer;
  warning?: string;
}

export type CompileCitationsPass = (
  request: CompileCitationsRequest,
) => Promise<CompileCitationsPassResult>;

let registeredCitationsPass: CompileCitationsPass | undefined =
  compileWithCitations;

/**
 * Registers (or with `undefined`, clears) the citations pass. The pass that
 * ships (`compileWithCitations`, Task 43) is registered at load; clearing it
 * makes a present option fail visibly rather than produce output without
 * citations, which is how the Task 24 seam tests run.
 */
export function registerCitationsPass(
  pass: CompileCitationsPass | undefined,
): void {
  registeredCitationsPass = pass;
}

/**
 * Validates the raw citations option from a request. Returns `undefined` only
 * when the option is absent; anything else must be exactly `{ styleId }` with a
 * bundled style id. Throws a fixed-message error that echoes no client input.
 */
export function parseCompileCitationsOption(
  raw: unknown,
): CompileCitationsOption | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new InvalidCitationsOptionError();
  }
  const keys = Object.keys(raw);
  const styleId = (raw as Record<string, unknown>).styleId;
  if (keys.length !== 1 || keys[0] !== "styleId") {
    throw new InvalidCitationsOptionError();
  }
  if (
    typeof styleId !== "string" ||
    !BUNDLED_CITATION_STYLES.some((style) => style.id === styleId)
  ) {
    throw new InvalidCitationsOptionError();
  }
  return { styleId };
}

// ---------------------------------------------------------------------------
// Feature 116, Task 43: the citations pass (FR-10 to FR-13, FR-16, FR-17).
// ---------------------------------------------------------------------------

/**
 * A citations compile failed. The message names what failed and carries no
 * client input; the compile never produces output without the citations.
 */
export class CitationsCompileError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CitationsCompileError";
  }
}

/** One rendered citation of a section, anchored by its UTF-16 offset in the section text. */
interface ManuscriptNote {
  offset: number;
  noteNumber: number | null;
  runs: CitationRun[];
}

interface ManuscriptSection {
  name: string;
  content: string;
  notes: ManuscriptNote[];
}

interface Manuscript {
  sections: ManuscriptSection[];
  bibliography: DocxCitationsInput["bibliography"];
}

/** Start offset of each text node in `tiptapToPlainText(document)`, keyed by its child-index path. */
function textNodeStarts(document: TipTapDocument): Map<string, number> {
  const starts = new Map<string, number>();
  let position = 0;
  const visit = (
    node: TipTapDocument["content"][number],
    path: number[],
  ): void => {
    if (node.text) {
      starts.set(path.join("."), position);
      position += node.text.length;
    }
    node.content?.forEach((child, i) => visit(child, [...path, i]));
    if (node.type === "paragraph" || node.type === "heading") position += 1;
  };
  document.content.forEach((node, i) => visit(node, [i]));
  return starts;
}

/** The section text the builders place notes in: the TipTap document as plain text. */
function sectionText(section: CitationSectionInput): string {
  return section.tiptap === undefined
    ? (section.plainText ?? "")
    : tiptapToPlainText(section.tiptap);
}

/**
 * Maps each anchor `{path, offset}` (an offset in one TipTap text node) to the
 * UTF-16 offset in the section's plain text, which is what the PDF and DOCX
 * builders place by.
 */
function toManuscriptNotes(
  rendered: CitationRenderedSection,
  document: TipTapDocument | undefined,
): ManuscriptNote[] {
  if (rendered.citations.length === 0) return [];
  const starts = document === undefined ? undefined : textNodeStarts(document);
  return rendered.citations.map((citation) => {
    const start = starts?.get(citation.anchor.path.join("."));
    if (start === undefined) {
      throw new CitationsCompileError(
        "A citation is anchored outside the text of its section.",
      );
    }
    return {
      offset: start + citation.anchor.offset,
      noteNumber: citation.noteNumber,
      runs: citation.runs,
    };
  });
}

/** The refusal of FR-17 for citations whose passages are not in the document. */
function unplacedError(
  sections: readonly CitationSectionInput[],
  rendered: readonly CitationRenderedSection[],
  sourceNames: ReadonlyMap<string, string | undefined>,
): CitationsCompileError | undefined {
  const parts: string[] = [];
  rendered.forEach((section, i) => {
    const resource = sections[i].storedName || "unnamed resource";
    for (const citation of section.unplaced) {
      const source =
        citation.sourceName ??
        sourceNames.get(citation.sourceId) ??
        UNNAMED_SOURCE_NAME;
      parts.push(`a citation of "${source}" in "${resource}"`);
    }
  });
  if (parts.length === 0) return undefined;
  return new CitationsCompileError(
    `Citations could not be placed because their passages are not in the document: ${parts.join("; ")}.`,
  );
}

/**
 * Loads the engine from the app's own files with no network request. On the
 * Node server and in tests the glue's `.wasm` is a `file:` URL, read here; a
 * bundler that resolves it to a same-origin path lets the glue fetch it.
 */
async function ensureCitationEngine(): Promise<void> {
  try {
    const url = new URL(
      "../citations/engine/hayagriva_wasm_bg.wasm",
      import.meta.url,
    );
    if (url.protocol === "file:") {
      await initCitationEngine(await readFile(nodeUrl.fileURLToPath(url)));
    } else {
      await initCitationEngine();
    }
  } catch (err) {
    throw new CitationsCompileError(
      "The citation engine could not be loaded.",
      { cause: err },
    );
  }
}

/** Reads, renders and anchors every citation of the compiled resources. */
async function prepareManuscript(
  request: CompileCitationsRequest,
): Promise<Manuscript> {
  const { body, option, projectPath } = request;
  const read = await loadCitationSections(
    projectPath,
    body.resourceIds,
    body.resources,
  );
  if (!read.ok) throw new CitationsCompileError(read.what);
  const sections = read.sections;

  const sourceIds = sections.flatMap((section) =>
    collectCitations({
      resourceId: section.meta.id,
      included: true,
      annotations: section.annotations,
      excerptAnnotationsBySource: {},
    }).map((citation) => citation.sourceId),
  );
  const cited = await readCitedSources(projectPath, sourceIds);

  const style = await loadBundledStyle(option.styleId);
  if (!style.ok) throw new CitationsCompileError(style.message);
  await ensureCitationEngine();

  const pass = renderCitationPass({
    resources: sections.map((section) => ({
      resourceId: section.meta.id,
      included: true,
      document: section.tiptap,
      annotations: section.annotations,
    })),
    sources: cited.sources,
    excerptAnnotationsBySource: cited.excerptAnnotationsBySource,
    style,
    renderIncomplete: renderIncompleteCitation,
  });
  if (pass.status === "failed") throw new CitationsCompileError(pass.message);

  const sourceNames = new Map(
    Object.entries(cited.sources).map(([id, source]) => [
      id,
      source.status === "present" ? source.name : undefined,
    ]),
  );
  const unplaced = unplacedError(sections, pass.sections, sourceNames);
  if (unplaced !== undefined) throw unplaced;

  const bibliography = buildBibliography({ items: pass.items, style });
  if (bibliography.status === "failed") {
    throw new CitationsCompileError(bibliography.message);
  }
  return {
    sections: sections.map((section, i) => ({
      name: section.meta.name,
      content: sectionText(section),
      notes: toManuscriptNotes(pass.sections[i], section.tiptap),
    })),
    bibliography:
      bibliography.entries.length === 0
        ? undefined
        : {
            heading: bibliography.heading,
            entries: bibliography.entries.map((entry) => ({
              runs: entry.runs,
            })),
          },
  };
}

async function renderDocxWithCitations(
  manuscript: Manuscript,
  includeHeaders: boolean,
): Promise<ArrayBuffer> {
  const sections: CompileSection[] = manuscript.sections.map(
    ({ name, content }) => ({ name, content }),
  );
  const doc = buildDocxDocument(
    sections,
    { includeHeaders },
    {
      sections: manuscript.sections.map((section) => ({
        notes: section.notes,
      })),
      bibliography: manuscript.bibliography,
    },
  );
  return bufferToArrayBuffer(await Packer.toBuffer(doc));
}

/**
 * Most render passes the PDF notes loop may take, counting the first pass
 * that has no notes. The loop re-renders while reserving room for the notes
 * moves a mark to another page; if the notes are not on stable pages within
 * this many passes the compile fails naming this bound and emits nothing.
 */
export const PDF_NOTE_LAYOUT_MAX_PASSES = 8;

/** Points kept clear between the last body line and the top of the notes. */
const PDF_NOTE_BODY_GAP = 8;

/**
 * Font size of a reference mark in `CompilePDFDocument` (`styles.noteMark`).
 * Read back from the layout data to find each mark's page;
 * `tests/unit/citations-pdf-layout-data-shape.test.ts` pins that a mark is a
 * run of this size.
 */
const PDF_NOTE_MARK_FONT_SIZE = 7;

const PDF_LAYOUT_UNREADABLE =
  "The PDF layout data is missing or has an unexpected shape, so the notes could not be placed on their pages.";

interface LayoutRunData {
  start: number;
  end: number;
  attributes?: { fontSize?: number };
}

interface LayoutNodeData {
  type?: string;
  box?: { top?: number; height?: number };
  style?: { paddingBottom?: number };
  props?: { fixed?: boolean };
  lines?: { string?: string; runs?: LayoutRunData[] }[];
  children?: LayoutNodeData[];
}

/** What one laid-out page tells the notes loop. */
interface PdfPageFacts {
  /** Space between the footer's top (less the gap) and the body area's bottom; above 0 means the body must give way. */
  shortfall: number;
  /** Note numbers whose reference mark sits on this page, in reading order. */
  marks: number[];
}

interface PdfLayoutFacts {
  pages: PdfPageFacts[];
}

function numberAt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CitationsCompileError(PDF_LAYOUT_UNREADABLE);
  }
  return value;
}

function* layoutNodes(node: LayoutNodeData): Generator<LayoutNodeData> {
  yield node;
  for (const child of node.children ?? []) yield* layoutNodes(child);
}

/** Note numbers of the reference marks under `nodes`, in layout order. */
function markNumbers(nodes: readonly LayoutNodeData[]): number[] {
  const found: number[] = [];
  for (const top of nodes) {
    for (const node of layoutNodes(top)) {
      for (const line of node.lines ?? []) {
        for (const run of line.runs ?? []) {
          if (run.attributes?.fontSize !== PDF_NOTE_MARK_FONT_SIZE) continue;
          const shown = (line.string ?? "").slice(run.start, run.end).trim();
          if (/^\d+$/.test(shown)) found.push(Number(shown));
        }
      }
    }
  }
  return found;
}

function pageFacts(page: LayoutNodeData): PdfPageFacts {
  const pageHeight = numberAt(page.box?.height);
  const bodyLimit = pageHeight - numberAt(page.style?.paddingBottom);
  const kids = page.children ?? [];
  const footer = kids.find((kid) => kid.props?.fixed === true);
  const body = kids.filter((kid) => kid.props?.fixed !== true);
  const footerHeight = footer === undefined ? 0 : numberAt(footer.box?.height);
  const footerTop =
    footer === undefined ? pageHeight : numberAt(footer.box?.top);
  return {
    shortfall:
      footerHeight > 0 ? bodyLimit - (footerTop - PDF_NOTE_BODY_GAP) : 0,
    marks: markNumbers(body),
  };
}

/** Reads the pages out of the `onRender` argument; anything else fails loudly. */
function readPdfLayout(arg: unknown): PdfLayoutFacts {
  const data = (
    arg as { _INTERNAL__LAYOUT__DATA_?: LayoutNodeData } | undefined
  )?._INTERNAL__LAYOUT__DATA_;
  if (
    data === undefined ||
    data === null ||
    data.type !== "DOCUMENT" ||
    !Array.isArray(data.children)
  ) {
    throw new CitationsCompileError(PDF_LAYOUT_UNREADABLE);
  }
  return { pages: data.children.map(pageFacts) };
}

/** Page number (1-based) to the note numbers marked on it; fails naming a missing mark. */
function placementOf(
  layout: PdfLayoutFacts,
  noteNumbers: readonly number[],
): Map<number, number[]> {
  const placement = new Map<number, number[]>();
  const seen = new Set<number>();
  layout.pages.forEach((page, i) => {
    for (const mark of page.marks) {
      if (seen.has(mark)) {
        throw new CitationsCompileError(
          `The reference mark of note ${mark} was found more than once in the rendered pages.`,
        );
      }
      seen.add(mark);
      placement.set(i + 1, [...(placement.get(i + 1) ?? []), mark]);
    }
  });
  for (const n of noteNumbers) {
    if (!seen.has(n)) {
      throw new CitationsCompileError(
        `The reference mark of note ${n} was not found in the rendered pages.`,
      );
    }
  }
  return placement;
}

function samePlacement(
  a: PdfNotePlacement | undefined,
  b: PdfNotePlacement,
): boolean {
  if (a === undefined || a.size !== b.size) return false;
  return [...b].every(([page, numbers]) => {
    const other = a.get(page);
    return (
      other !== undefined &&
      other.length === numbers.length &&
      other.every((n, i) => n === numbers[i])
    );
  });
}

type ReservedPdfDocumentProps = CompilePDFDocumentProps & {
  /** Points added to the page's bottom padding so body text stops above the notes. */
  reserve: number;
};

/**
 * `CompilePDFDocument` with extra bottom padding on its page. react-pdf draws
 * the fixed footer `position: absolute`, so it reserves no room; the body area
 * of every page is shortened instead, by the same amount on each page.
 */
function ReservedPdfDocument({
  reserve,
  ...props
}: ReservedPdfDocumentProps): React.ReactElement {
  const document = CompilePDFDocument(props);
  if (reserve === 0) return document;
  const page = React.Children.only(
    (document.props as { children?: React.ReactNode }).children,
  ) as React.ReactElement<{ style?: { paddingBottom?: number } }>;
  const base = page.props.style?.paddingBottom;
  if (page.type !== Page || typeof base !== "number") {
    throw new CitationsCompileError(
      "The PDF document has an unexpected structure, so room for the notes could not be reserved.",
    );
  }
  return React.cloneElement(
    document,
    {},
    React.cloneElement(page, {
      style: [page.props.style, { paddingBottom: base + reserve }],
    } as never),
  );
}

interface PdfNotesInput {
  sections: CompileSection[];
  notes: PdfNote[];
  bibliography: Manuscript["bibliography"];
  includeHeaders: boolean;
}

/**
 * Renders the PDF with notes in each page's footer. Pass 1 has no notes and
 * its layout data gives each mark's page; later passes draw the footers for
 * the placement last measured, with body room reserved for the tallest
 * footer, until the marks sit on the pages the footers were drawn for and no
 * footer reaches into the body. Never returns a PDF that has not settled.
 */
async function renderPdfWithNotes(
  input: PdfNotesInput,
  render: PdfRenderer,
): Promise<ArrayBuffer> {
  const noteNumbers = input.notes.map((n) => n.noteNumber);
  let placement: PdfNotePlacement | undefined;
  let reserve = 0;
  let previous: { pageCount: number; reserve: number } | undefined;
  for (let pass = 1; pass <= PDF_NOTE_LAYOUT_MAX_PASSES; pass += 1) {
    let captured: unknown;
    let didRender = false;
    const element = React.createElement(ReservedPdfDocument, {
      sections: input.sections,
      includeHeaders: input.includeHeaders,
      citations: { notes: input.notes, bibliography: input.bibliography },
      notePlacement: placement,
      reserve,
      onRender: (arg: unknown) => {
        didRender = true;
        captured = arg;
      },
    } as ReservedPdfDocumentProps) as React.ReactElement<DocumentProps>;
    const rendered = await render(element);
    if (!didRender) throw new CitationsCompileError(PDF_LAYOUT_UNREADABLE);
    const layout = readPdfLayout(captured);
    if (
      previous !== undefined &&
      previous.reserve === reserve &&
      previous.pageCount !== layout.pages.length
    ) {
      throw new CitationsCompileError(
        `The PDF has ${previous.pageCount} pages without the notes and ${layout.pages.length} pages with them, so a note could sit on the wrong page.`,
      );
    }
    previous = { pageCount: layout.pages.length, reserve };
    const measured = placementOf(layout, noteNumbers);
    const shortfall = Math.max(0, ...layout.pages.map((p) => p.shortfall));
    if (
      placement !== undefined &&
      shortfall <= 0 &&
      samePlacement(placement, measured)
    ) {
      return rendered;
    }
    placement = measured;
    reserve += Math.ceil(shortfall);
  }
  throw new CitationsCompileError(
    `The PDF notes did not settle on stable pages within ${PDF_NOTE_LAYOUT_MAX_PASSES} layout passes (PDF_NOTE_LAYOUT_MAX_PASSES), so no PDF was produced.`,
  );
}

async function renderPdfWithCitations(
  manuscript: Manuscript,
  includeHeaders: boolean,
  render: PdfRenderer,
): Promise<ArrayBuffer> {
  const notes: PdfNote[] = [];
  manuscript.sections.forEach((section, sectionIndex) => {
    for (const note of section.notes) {
      if (note.noteNumber === null) {
        throw new CitationsCompileError(
          "In-text citation styles are not available for PDF.",
        );
      }
      notes.push({
        sectionIndex,
        offset: note.offset,
        noteNumber: note.noteNumber,
        runs: note.runs,
      });
    }
  });
  const input: PdfNotesInput = {
    sections: manuscript.sections.map(({ name, content }) => ({
      name,
      content,
    })),
    notes,
    bibliography: manuscript.bibliography,
    includeHeaders,
  };
  registerIBMPlexFonts();
  try {
    return await renderPdfWithNotes(input, render);
  } catch (err) {
    if (err instanceof CitationsCompileError || !isFontError(err)) throw err;
    throw new CitationsCompileError(
      "The PDF fonts could not be loaded, so the citations could not be rendered.",
      { cause: err },
    );
  }
}

/**
 * The citations pass: reads the TipTap documents, renders the citations and
 * the bibliography, and builds the PDF or DOCX. Registered by default.
 */
export async function compileWithCitations(
  request: CompileCitationsRequest,
): Promise<CompileCitationsPassResult> {
  const manuscript = await prepareManuscript(request);
  const shouldIncludeHeaders = request.body.includeHeaders;
  if (request.format === "docx") {
    return {
      arrayBuffer: await renderDocxWithCitations(
        manuscript,
        shouldIncludeHeaders,
      ),
    };
  }
  return {
    arrayBuffer: await renderPdfWithCitations(
      manuscript,
      shouldIncludeHeaders,
      request.render ?? renderPdfOnServer,
    ),
  };
}

/** Enters the seam; only called when the option is present. */
async function runCitationsSeam(
  request: CompileCitationsRequest,
): Promise<CompileCitationsPassResult> {
  if (!registeredCitationsPass) throw new CitationsUnavailableError();
  return registeredCitationsPass(request);
}

/** Markdown and text refuse any citations option, even an invalid one. */
function refuseCitationsOption(body: CompileBody): void {
  if (body.citations !== undefined) {
    throw new CitationsNotSupportedForFormatError();
  }
}

/**
 * Compiles the requested text resources into a PDF.
 *
 * Lifted verbatim from `POST /api/compile/pdf`'s `handlePost` body (minus
 * the header construction, which the route reapplies from this result).
 */
export async function compilePdfCore(
  body: CompileBody,
  render: PdfRenderer = renderPdfOnServer,
): Promise<CompilePdfCoreResult> {
  const {
    projectId,
    resourceIds,
    resources,
    includeHeaders: shouldIncludeHeaders,
    projectName,
  } = body;

  const projectPath = resolveProjectPathOrThrow(projectId);

  const option = parseCompileCitationsOption(body.citations);
  if (option !== undefined) {
    const result = await runCitationsSeam({
      format: "pdf",
      body,
      option,
      projectPath,
      render,
    });
    return {
      arrayBuffer: result.arrayBuffer,
      filename: `${slugify(projectName)}.pdf`,
      warning: result.warning,
    };
  }

  const sections = await loadTextSections<CompileSection>(
    projectPath,
    resourceIds,
    resources,
    (meta, { plainText }) => ({ name: meta.name, content: plainText ?? "" }),
  );

  const filename = `${slugify(projectName)}.pdf`;

  let rendered: ArrayBuffer;
  let didFontFallback = false;

  try {
    registerIBMPlexFonts();
    rendered = await render(
      React.createElement(CompilePDFDocument, {
        sections,
        includeHeaders: shouldIncludeHeaders,
      }) as React.ReactElement<DocumentProps>,
    );
  } catch (err) {
    if (!isFontError(err)) throw err;
    didFontFallback = true;
    rendered = await render(
      React.createElement(CompilePDFFallbackDocument, {
        sections,
        includeHeaders: shouldIncludeHeaders,
      }) as React.ReactElement<DocumentProps>,
    );
  }

  return {
    arrayBuffer: rendered,
    filename,
    warning: didFontFallback ? "font-fallback" : undefined,
  };
}

/**
 * Compiles the requested text resources into a DOCX document.
 *
 * Lifted verbatim from `POST /api/compile/docx`'s `handlePost` body (minus
 * the header construction, which the route reapplies from this result).
 */
export async function compileDocxCore(
  body: CompileBody,
): Promise<CompileDocxCoreResult> {
  const {
    projectId,
    resourceIds,
    resources,
    includeHeaders: shouldIncludeHeaders,
    projectName,
  } = body;

  const projectPath = resolveProjectPathOrThrow(projectId);

  const option = parseCompileCitationsOption(body.citations);
  if (option !== undefined) {
    const result = await runCitationsSeam({
      format: "docx",
      body,
      option,
      projectPath,
    });
    return {
      arrayBuffer: result.arrayBuffer,
      filename: `${slugify(projectName)}.docx`,
    };
  }

  const sections = await loadTextSections<CompileSection>(
    projectPath,
    resourceIds,
    resources,
    (meta, { plainText }) => ({ name: meta.name, content: plainText ?? "" }),
  );

  const filename = `${slugify(projectName)}.docx`;

  const doc = buildDocxDocument(sections, {
    includeHeaders: shouldIncludeHeaders,
  });
  const buffer = await Packer.toBuffer(doc);

  return { arrayBuffer: bufferToArrayBuffer(buffer), filename };
}

/**
 * Compiles the requested text resources into a single plain-text document.
 *
 * Lifted verbatim from `POST /api/compile/text`'s `handlePost` body.
 */
export async function compileTextCore(
  body: CompileBody,
): Promise<CompileTextCoreResult> {
  refuseCitationsOption(body);
  const {
    projectId,
    resourceIds,
    resources,
    includeHeaders: shouldIncludeHeaders,
    projectName,
  } = body;

  const projectPath = resolveProjectPathOrThrow(projectId);

  const sections = await loadTextSections<CompileSection>(
    projectPath,
    resourceIds,
    resources,
    (meta, { plainText }) => ({ name: meta.name, content: plainText ?? "" }),
  );

  const text = compileToText(sections, {
    includeHeaders: shouldIncludeHeaders,
  });
  const filename = `${slugify(projectName)}.txt`;

  return { text, filename };
}

/**
 * Compiles the requested text resources into a single Markdown document.
 *
 * Lifted verbatim from `POST /api/compile/markdown`'s `handlePost` body.
 */
export async function compileMarkdownCore(
  body: CompileBody,
): Promise<CompileMarkdownCoreResult> {
  refuseCitationsOption(body);
  const {
    projectId,
    resourceIds,
    resources,
    includeHeaders: shouldIncludeHeaders,
    projectName,
  } = body;

  const projectPath = resolveProjectPathOrThrow(projectId);

  // Markdown needs the TipTap JSON, not the cached plain text.
  const sections = await loadTextSections<MarkdownSection>(
    projectPath,
    resourceIds,
    resources,
    (meta, { tiptap }) => ({ name: meta.name, doc: tiptap }),
  );

  const { markdown, warnings } = compileToMarkdown(sections, {
    includeHeaders: shouldIncludeHeaders,
  });
  const filename = `${slugify(projectName)}.md`;

  return { markdown, filename, warnings };
}
