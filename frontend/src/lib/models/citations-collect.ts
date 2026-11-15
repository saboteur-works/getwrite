/**
 * @module citations-collect
 *
 * Feature 116 (citations at compile), FR-11 and FR-14: pure collection of a
 * resource's citations from its annotations, and the choice of each
 * citation's locator. Works over arrays passed in; reads and writes nothing.
 * No React, JSX, JSON, `node:*` or engine import.
 *
 * A citation is an annotation whose `target.sourceId` is not the resource it
 * sits in. An excerpt targets its host Source, and a Source citing itself is
 * the same shape, so both fall out of that one rule. A resource left out of
 * the compile contributes none.
 *
 * Locator selection: the citation's own locator wins; only when it has none
 * does an excerpt citation (a target with `excerptId`) use the locator of the
 * excerpt annotation. Page, paragraph and line come back as CSL label kinds;
 * a timestamp, or a locator with no type, comes back as literal text flagged
 * never to be a label. A value is text and is never trimmed, parsed or
 * checked. Passing the label to the engine is a later task.
 */
import type { Annotation, AnnotationTarget } from "./types";

/** CSL locator labels the engine supplies the wording for (FR-14). */
export type CitationLocatorLabel = "page" | "paragraph" | "line";

/** The locator chosen for a citation; `none` is its own case (FR-14). */
export type ResolvedCitationLocator =
  | { kind: "none" }
  | { kind: "label"; label: CitationLocatorLabel; value: string }
  | { kind: "literal"; text: string; neverLabel: true };

/** One collected citation. */
export interface CollectedCitation {
  /** Id of the citing annotation (and of its `annotation` mark). */
  annotationId: string;
  /** The resource the annotation sits in. */
  resourceId: string;
  /** The cited Source. */
  sourceId: string;
  excerptId?: string;
  /** The Source's name kept from citing time, when saved. */
  sourceName?: string;
  /** The saved quote of the cited passage. */
  quote: string;
  locator: ResolvedCitationLocator;
}

export interface CollectCitationsInput {
  resourceId: string;
  /** False when the resource is left out of the compile. */
  included: boolean;
  annotations: readonly Annotation[];
  /** Annotations of each cited Source, keyed by Source id, for excerpt locators. */
  excerptAnnotationsBySource: Readonly<Record<string, readonly Annotation[]>>;
}

const LABEL_KINDS: readonly string[] = ["page", "paragraph", "line"];

function isLabel(type: string | undefined): type is CitationLocatorLabel {
  return type !== undefined && LABEL_KINDS.includes(type);
}

function toResolved(
  locator: NonNullable<AnnotationTarget["locator"]>,
): ResolvedCitationLocator {
  if (isLabel(locator.type)) {
    return { kind: "label", label: locator.type, value: locator.value };
  }
  return { kind: "literal", text: locator.value, neverLabel: true };
}

/**
 * Choose a citation's locator: its own, else (for an excerpt citation) the
 * excerpt's, else none.
 */
export function resolveCitationLocator(
  target: AnnotationTarget,
  excerptAnnotationsBySource: Readonly<Record<string, readonly Annotation[]>>,
): ResolvedCitationLocator {
  if (target.locator !== undefined) return toResolved(target.locator);
  if (target.excerptId === undefined) return { kind: "none" };
  const excerpt = (excerptAnnotationsBySource[target.sourceId] ?? []).find(
    (a) => a.id === target.excerptId,
  );
  const inherited = excerpt?.target?.locator;
  return inherited === undefined ? { kind: "none" } : toResolved(inherited);
}

/** The citations of one resource, in annotation order. */
export function collectCitations(
  input: CollectCitationsInput,
): CollectedCitation[] {
  if (!input.included) return [];
  const out: CollectedCitation[] = [];
  for (const annotation of input.annotations) {
    const target = annotation.target;
    if (target === undefined || target.sourceId === input.resourceId) continue;
    out.push({
      annotationId: annotation.id,
      resourceId: input.resourceId,
      sourceId: target.sourceId,
      ...(target.excerptId === undefined
        ? {}
        : { excerptId: target.excerptId }),
      ...(target.sourceName === undefined
        ? {}
        : { sourceName: target.sourceName }),
      quote: annotation.quote,
      locator: resolveCitationLocator(target, input.excerptAnnotationsBySource),
    });
  }
  return out;
}
