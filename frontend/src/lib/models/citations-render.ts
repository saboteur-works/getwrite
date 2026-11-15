/**
 * @module citations-render
 *
 * Feature 116 (citations at compile), FR-11 and FR-17: the render pass.
 * Over the compiled resources it renders each citation (the definition of
 * `citations-collect.ts`) through the engine adapter in the bundled style, and
 * returns, per resource, the unchanged TipTap document plus each citation's
 * anchor (`citations-anchor.ts`), note number and formatted runs. The PDF and
 * DOCX renderers (Tasks 41 and 42) place the notes from that output.
 *
 * - Pure over the inputs it is handed: the resources in compile order, each
 *   cited Source's read result, the style outcome and the excerpt annotations.
 *   The caller reads storage, loads the style and initialises the engine.
 * - The engine is reached only through `../citations/citation-engine`.
 * - The document is returned as given; the text of a cited passage is never
 *   changed, and a citation is a position beside the text, not text in it.
 * - A resource left out of the compile contributes no citation and no section.
 * - Notes are numbered once across the whole manuscript, from 1, in compile
 *   order then document order, counting every placed citation of a note
 *   style, incomplete ones included.
 * - A failure is its own result (`status: "failed"`) naming what failed in a
 *   fixed sentence that carries no stored content, never an empty `ok`.
 * - Seam for Task 39: `renderIncomplete` is called for each citation that
 *   cannot be rendered in full (a removed Source, a Source with no fields, a
 *   Source missing a required detail) with the gap and the runs the engine
 *   gave (empty when the Source has no item). Without it the runs are
 *   returned as they are; the marker is Task 39's.
 * - The bibliography is Task 40's.
 *
 * No React, JSX, JSON or `node:*` import.
 */
import {
  occurrenceLocator,
  renderCitations,
  type CitationOccurrence,
  type CitationRun,
} from "../citations/citation-engine";
import type { StyleLoadOutcome } from "../citations/style-loader";
import { placeCitationAnchors, type CitationAnchor } from "./citations-anchor";
import { collectCitations, type CollectedCitation } from "./citations-collect";
import {
  mapCitationFieldsToCsl,
  type CitationFieldsInput,
  type CslItem,
} from "./citations-csl-mapper";
import { findMissingDetails } from "./citations-required-details";
import type { CitationFailure, CitationGap } from "./citations-types";
import type { Annotation, TipTapDocument } from "./types";

/** One resource of the compile, in compile order. */
export interface CitationRenderResource {
  resourceId: string;
  /** False when the resource is left out of the compile. */
  included: boolean;
  document: TipTapDocument | undefined;
  annotations: readonly Annotation[];
}

/** What reading a cited Source gave. */
export type CitationSourceInput =
  | {
      status: "present";
      /** The Source's current name. */
      name?: string;
      /** Its stored citation fields; `undefined` when it has none. */
      citationFields: CitationFieldsInput | undefined;
    }
  | { status: "removed" }
  | { status: "unreadable" };

/** Called for a citation that cannot be rendered in full (Task 39's seam). */
export type RenderIncompleteFn = (
  gap: CitationGap,
  runs: readonly CitationRun[],
) => CitationRun[];

export interface CitationRenderInput {
  /** Resources in compile order. */
  resources: readonly CitationRenderResource[];
  /** Read result of each cited Source, keyed by Source id. */
  sources: Readonly<Record<string, CitationSourceInput>>;
  /** Annotations of each cited Source, for excerpt locators. */
  excerptAnnotationsBySource: Readonly<Record<string, readonly Annotation[]>>;
  /** The outcome of loading the bundled style. */
  style: StyleLoadOutcome;
  renderIncomplete?: RenderIncompleteFn;
}

/** One rendered citation of a resource. */
export interface RenderedSectionCitation {
  annotationId: string;
  sourceId: string;
  anchor: CitationAnchor;
  /** Manuscript-wide note number from 1, or null for an in-text style. */
  noteNumber: number | null;
  runs: CitationRun[];
  /** Set when the citation cannot be rendered in full. */
  incomplete?: CitationGap;
}

/** A compiled resource's document with its rendered citations. */
export interface CitationRenderedSection {
  resourceId: string;
  /** The document exactly as given. */
  document: TipTapDocument | undefined;
  citations: RenderedSectionCitation[];
  /** Citations whose `annotation` mark is not in the document; not rendered. */
  unplaced: CollectedCitation[];
}

export type CitationRenderResult =
  | {
      status: "ok";
      sections: CitationRenderedSection[];
      /** The items the engine was given, one per cited Source with fields. */
      items: CslItem[];
    }
  | CitationFailure;

/** How each bundled style places a citation. */
const PLACEMENT_BY_STYLE_ID: Readonly<Record<string, "note" | "in-text">> = {
  "chicago-notes-bibliography": "note",
};

interface Entry {
  sectionIndex: number;
  citation: CollectedCitation;
  anchor: CitationAnchor;
  source: CitationSourceInput;
  hasItem: boolean;
  gap: CitationGap | undefined;
}

function failed(
  failure: CitationFailure["failure"],
  message: string,
): CitationFailure {
  return { status: "failed", failure, message };
}

function gapFor(
  styleId: string,
  citation: CollectedCitation,
  source: CitationSourceInput,
): CitationGap | undefined {
  const base = { resourceId: citation.resourceId, sourceId: citation.sourceId };
  if (source.status === "removed") {
    return {
      kind: "source-removed",
      ...base,
      ...(citation.sourceName === undefined
        ? {}
        : { sourceName: citation.sourceName }),
    };
  }
  if (source.status !== "present") return undefined;
  const name = citation.sourceName ?? source.name;
  const named = name === undefined || name === "" ? {} : { sourceName: name };
  if (source.citationFields === undefined) {
    return { kind: "missing-detail", ...base, ...named, missingDetails: [] };
  }
  const missing =
    styleId === "chicago-notes-bibliography"
      ? findMissingDetails(styleId, source.citationFields)
      : [];
  return missing.length === 0
    ? undefined
    : { kind: "missing-detail", ...base, ...named, missingDetails: missing };
}

/** True when a cited Source was not handed over or could not be read. */
function unreadSource(
  citations: readonly CollectedCitation[],
  sources: CitationRenderInput["sources"],
): boolean {
  return citations.some((c) => {
    const source = Object.hasOwn(sources, c.sourceId)
      ? sources[c.sourceId]
      : undefined;
    return source === undefined || source.status === "unreadable";
  });
}

function collectEntries(
  input: CitationRenderInput,
  styleId: string,
  noteStyle: boolean,
): { sections: CitationRenderedSection[]; entries: Entry[] } | CitationFailure {
  const sections: CitationRenderedSection[] = [];
  const entries: Entry[] = [];
  for (const resource of input.resources) {
    if (!resource.included) continue;
    const collected = collectCitations({
      resourceId: resource.resourceId,
      included: true,
      annotations: resource.annotations,
      excerptAnnotationsBySource: input.excerptAnnotationsBySource,
    });
    if (unreadSource(collected, input.sources)) {
      return failed(
        "read-failed",
        "A Source cited in the compiled resources could not be read.",
      );
    }
    const { placed, unplaced } = placeCitationAnchors(
      resource.document,
      collected,
      { noteStyle },
    );
    const sectionIndex = sections.length;
    sections.push({
      resourceId: resource.resourceId,
      document: resource.document,
      citations: [],
      unplaced,
    });
    for (const anchor of placed) {
      const citation = collected.find(
        (c) => c.annotationId === anchor.annotationId,
      );
      if (citation === undefined) continue;
      const source = input.sources[citation.sourceId];
      const gap = gapFor(styleId, citation, source);
      const hasItem =
        source.status === "present" && source.citationFields !== undefined;
      entries.push({ sectionIndex, citation, anchor, source, hasItem, gap });
    }
  }
  return { sections, entries };
}

function buildItems(entries: readonly Entry[]): CslItem[] {
  const items = new Map<string, CslItem>();
  for (const { citation, source } of entries) {
    if (
      source.status === "present" &&
      source.citationFields !== undefined &&
      !items.has(citation.sourceId)
    ) {
      items.set(
        citation.sourceId,
        mapCitationFieldsToCsl(citation.sourceId, source.citationFields),
      );
    }
  }
  return [...items.values()];
}

/**
 * Render every citation of the compiled resources. The engine must already be
 * initialised by the caller; if it is not, the pass fails naming the engine.
 */
export function renderCitationPass(
  input: CitationRenderInput,
): CitationRenderResult {
  if (!input.style.ok) {
    return failed("style-load-failed", input.style.message);
  }
  const styleId = input.style.styleId;
  const placement = PLACEMENT_BY_STYLE_ID[styleId] ?? "note";
  const collected = collectEntries(input, styleId, placement === "note");
  if ("status" in collected) return collected;
  const { sections, entries } = collected;

  const items = buildItems(entries);
  const rendered = entries.filter((e) => e.hasItem);
  const occurrences: CitationOccurrence[] = rendered.map((e) => ({
    itemIds: [e.citation.sourceId],
    ...occurrenceLocator(e.citation.locator),
  }));
  let runsByEntry = new Map<Entry, CitationRun[]>();
  if (occurrences.length > 0) {
    const outcome = renderCitations({
      styleXml: input.style.style,
      localeXml: input.style.locale,
      items,
      citations: occurrences,
      placement,
    });
    if (!outcome.ok) {
      return failed(
        "engine-failed",
        `The citation engine failed while rendering citations (${outcome.stage}).`,
      );
    }
    runsByEntry = new Map(
      rendered.map((e, i) => [e, outcome.citations[i].runs]),
    );
  }

  entries.forEach((entry, index) => {
    const engineRuns = runsByEntry.get(entry) ?? [];
    const runs =
      entry.gap !== undefined && input.renderIncomplete !== undefined
        ? input.renderIncomplete(entry.gap, engineRuns)
        : engineRuns;
    sections[entry.sectionIndex].citations.push({
      annotationId: entry.citation.annotationId,
      sourceId: entry.citation.sourceId,
      anchor: entry.anchor,
      noteNumber: placement === "note" ? index + 1 : null,
      runs,
      ...(entry.gap === undefined ? {} : { incomplete: entry.gap }),
    });
  });
  return { status: "ok", sections, items };
}
