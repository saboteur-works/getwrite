/**
 * The one module that imports the citation engine (Hayagriva compiled to
 * WebAssembly, vendored in `./engine/`; decision in
 * specs/features/citations-at-compile/experiments/task-9.md). A change of
 * engine changes this file only.
 *
 * Pure of React, JSX and JSON files. The style and locale arrive as text, so
 * the caller (Task 33's loader) decides where they come from. Rendering is
 * synchronous once `initCitationEngine` has resolved, makes no network request
 * and holds one engine instance per module load.
 *
 * Outcomes follow docs/standards/failure-visibility.md: a failure is its own
 * return shape (`ok: false`) naming the stage, never an empty render.
 */
import init, { initSync, render } from "./engine/hayagriva_wasm.js";
import type { CslItem } from "../models/citations-csl-mapper";

/** A locator the engine understands; Task 34 maps stored labels onto these. */
export interface CitationLocator {
  label: "page" | "paragraph" | "line";
  value: string;
}

/** One cited place in the manuscript, in reading order. */
export interface CitationOccurrence {
  /** CSL item ids; the locator applies to the first one only. */
  itemIds: readonly string[];
  locator: CitationLocator | null;
}

/** A run of text with the formatting a PDF or DOCX renderer can apply. */
export interface CitationRun {
  text: string;
  italic?: boolean;
  bold?: boolean;
  smallCaps?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  link?: string;
}

export interface RenderedCitation {
  /** Manuscript-wide note number from 1, or null for an in-text citation. */
  noteNumber: number | null;
  runs: CitationRun[];
}

export interface RenderedBibliographyEntry {
  /** The CSL item id. */
  key: string;
  runs: CitationRun[];
}

export interface CitationRenderRequest {
  styleXml: string;
  localeXml: string;
  /** Every item that may be cited or listed; ids must be unique. */
  items: readonly CslItem[];
  /** All occurrences of the whole manuscript, so notes are numbered once. */
  citations: readonly CitationOccurrence[];
  placement: "note" | "in-text";
}

export interface CitationRenderSuccess {
  ok: true;
  citations: RenderedCitation[];
  /** Each item with bibliography text, once, in the style's order. */
  bibliography: RenderedBibliographyEntry[];
  /** Item ids the engine gave no bibliography text (for example interviews). */
  omittedFromBibliography: string[];
}

export type CitationEngineStage =
  | "load"
  | "style"
  | "locale"
  | "items"
  | "citations"
  | "citation"
  | "render"
  | "result";

export interface CitationRenderFailure {
  ok: false;
  stage: CitationEngineStage;
  message: string;
}

export type CitationRenderOutcome =
  | CitationRenderSuccess
  | CitationRenderFailure;

const KNOWN_STAGES: ReadonlySet<string> = new Set<CitationEngineStage>([
  "style",
  "locale",
  "items",
  "citations",
  "citation",
  "render",
]);

let isEngineReady = false;
let engineLoading: Promise<void> | null = null;

/**
 * Loads the engine once. Pass the `.wasm` bytes (or a compiled module) on the
 * Node server and in tests; with none, the glue fetches the same-origin asset
 * beside it, which is how the browser build loads it.
 */
export function initCitationEngine(
  wasm?: BufferSource | WebAssembly.Module,
): Promise<void> {
  if (isEngineReady) return Promise.resolve();
  if (engineLoading === null) {
    const loading: Promise<void> =
      wasm === undefined
        ? init().then(() => undefined)
        : Promise.resolve().then(() => {
            initSync({ module: wasm });
          });
    engineLoading = loading.then(
      () => {
        isEngineReady = true;
      },
      (err: unknown) => {
        engineLoading = null;
        throw err;
      },
    );
  }
  return engineLoading;
}

/** The text of runs with the formatting dropped. */
export function runsToPlainText(runs: readonly CitationRun[]): string {
  return runs.map((r) => r.text).join("");
}

function fail(
  stage: CitationEngineStage,
  message: string,
): CitationRenderFailure {
  return { ok: false, stage, message };
}

/** Maps what the engine threw to a failure; a non-JSON throw is `render`. */
function failureFromThrown(err: unknown): CitationRenderFailure {
  const raw =
    typeof err === "string" ? err : err instanceof Error ? err.message : "";
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
      const detail = (parsed as { error: unknown }).error;
      if (typeof detail === "object" && detail !== null) {
        const { stage, message } = detail as {
          stage?: unknown;
          message?: unknown;
        };
        if (typeof stage === "string" && KNOWN_STAGES.has(stage)) {
          return fail(
            stage as CitationEngineStage,
            typeof message === "string" && message !== ""
              ? message
              : "no detail",
          );
        }
      }
    }
  } catch {
    // Not JSON: fall through to the generic failure below.
  }
  return fail(
    "render",
    raw !== "" ? raw : "the citation engine failed without a message",
  );
}

function parseRuns(value: unknown): CitationRun[] | null {
  if (!Array.isArray(value)) return null;
  const runs: CitationRun[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) return null;
    const r = entry as Record<string, unknown>;
    if (typeof r.text !== "string") return null;
    const run: CitationRun = { text: r.text };
    if (r.italic === true) run.italic = true;
    if (r.bold === true) run.bold = true;
    if (r.smallCaps === true) run.smallCaps = true;
    if (r.superscript === true) run.superscript = true;
    if (r.subscript === true) run.subscript = true;
    if (typeof r.link === "string") run.link = r.link;
    runs.push(run);
  }
  return runs;
}

interface ParsedOutput {
  citations: RenderedCitation[];
  bibliography: RenderedBibliographyEntry[];
}

function parseOutput(
  json: string,
  expectedCitations: number,
): ParsedOutput | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const { citations, bibliography } = data as {
    citations?: unknown;
    bibliography?: unknown;
  };
  if (!Array.isArray(citations) || !Array.isArray(bibliography)) return null;
  if (citations.length !== expectedCitations) return null;
  const outCitations: RenderedCitation[] = [];
  for (const c of citations) {
    const runs = parseRuns((c as { runs?: unknown } | null)?.runs);
    const n = (c as { noteNumber?: unknown } | null)?.noteNumber;
    if (runs === null || runs.length === 0) return null;
    outCitations.push({ noteNumber: typeof n === "number" ? n : null, runs });
  }
  const outBib: RenderedBibliographyEntry[] = [];
  for (const b of bibliography) {
    const runs = parseRuns((b as { runs?: unknown } | null)?.runs);
    const key = (b as { key?: unknown } | null)?.key;
    if (runs === null || typeof key !== "string") return null;
    outBib.push({ key, runs });
  }
  return { citations: outCitations, bibliography: outBib };
}

function validateRequest(
  req: CitationRenderRequest,
): CitationRenderFailure | null {
  const seen = new Set<string>();
  for (const item of req.items) {
    if (seen.has(item.id)) {
      return fail("items", `two items share the id "${item.id}"`);
    }
    seen.add(item.id);
  }
  for (const [i, c] of req.citations.entries()) {
    if (c.itemIds.length === 0) {
      return fail("citations", `citation ${i} names no item`);
    }
  }
  return null;
}

/**
 * Renders every citation of the manuscript and the bibliography in one call.
 * Notes are numbered here, from 1 in the order given, so a caller passing the
 * whole manuscript gets one numbering; a bibliography entry appears once per
 * item with text.
 */
export function renderCitations(
  req: CitationRenderRequest,
): CitationRenderOutcome {
  if (!isEngineReady) {
    return fail("load", "the citation engine has not been loaded");
  }
  const invalid = validateRequest(req);
  if (invalid !== null) return invalid;

  const payload = req.citations.map((c, i) => ({
    itemIds: [...c.itemIds],
    locator: c.locator,
    // The engine requires a position number for every citation, in-text ones
    // included; it is dropped from the result below for an in-text citation.
    noteNumber: i + 1,
  }));

  let raw: string;
  try {
    raw = render(
      req.styleXml,
      req.localeXml,
      JSON.stringify(req.items),
      JSON.stringify(payload),
    );
  } catch (err: unknown) {
    return failureFromThrown(err);
  }

  const parsed = parseOutput(raw, req.citations.length);
  if (parsed === null) {
    return fail(
      "result",
      "the engine returned output that does not match the request",
    );
  }
  if (req.placement === "in-text") {
    for (const c of parsed.citations) c.noteNumber = null;
  }
  const keys = parsed.bibliography.map((b) => b.key);
  if (new Set(keys).size !== keys.length) {
    return fail(
      "result",
      "the engine listed an item more than once in the bibliography",
    );
  }
  const listed = new Set(keys);
  return {
    ok: true,
    citations: parsed.citations,
    bibliography: parsed.bibliography,
    omittedFromBibliography: req.items
      .map((i) => i.id)
      .filter((id) => !listed.has(id)),
  };
}
