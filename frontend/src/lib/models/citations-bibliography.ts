/**
 * @module citations-bibliography
 *
 * Feature 116 (citations at compile), FR-11 and FR-17: the bibliography of
 * the Sources cited in the compiled resources, each once, in the order and
 * formatting the style gives, under the heading of the style's table.
 *
 * - Input is the `items` of the Task 38 pass (`renderCitationPass`): one CSL
 *   item per cited Source with fields, collected only from placed citations of
 *   resources that are in the compile. A Source's own exclusion from the
 *   compile therefore does not matter, and a Source cited only in an excluded
 *   resource, or not cited, is never an item.
 * - The pass result does not carry the bibliography, so this module calls the
 *   adapter itself (`renderCitations`) with one occurrence per item. Order and
 *   formatting are the engine's, not re-sorted or re-formatted here.
 * - Items the engine gave no bibliography text (for example interviews) are
 *   returned in `omittedFromBibliography`, never hidden.
 * - A failure is its own result (`status: "failed"`) with a fixed sentence
 *   that carries no stored content, never an empty `ok`. An `ok` with no
 *   entries means no item was handed over.
 *
 * No React, JSX, JSON or `node:*` import.
 */
import {
  renderCitations,
  type RenderedBibliographyEntry,
} from "../citations/citation-engine";
import type { StyleLoadOutcome } from "../citations/style-loader";
import type { CslItem } from "./citations-csl-mapper";
import type { CitationFailure } from "./citations-types";

export interface BibliographyInput {
  /** `items` of an `ok` Task 38 pass. */
  items: readonly CslItem[];
  /** The outcome of loading the bundled style. */
  style: StyleLoadOutcome;
}

export type BibliographyResult =
  | {
      status: "ok";
      /** From the style's table, keyed by style id. */
      heading: string;
      /** Each cited Source once, keyed by Source id, in the style's order. */
      entries: RenderedBibliographyEntry[];
      /** Source ids the engine gave no bibliography text. */
      omittedFromBibliography: string[];
    }
  | CitationFailure;

/** Builds the bibliography of the cited Sources through the adapter. */
export function buildBibliography(
  input: BibliographyInput,
): BibliographyResult {
  if (!input.style.ok) {
    return {
      status: "failed",
      failure: "style-load-failed",
      message: input.style.message,
    };
  }
  const { style } = input;
  if (input.items.length === 0) {
    return {
      status: "ok",
      heading: style.bibliographyHeading,
      entries: [],
      omittedFromBibliography: [],
    };
  }
  const outcome = renderCitations({
    styleXml: style.style,
    localeXml: style.locale,
    items: input.items,
    citations: input.items.map((item) => ({
      itemIds: [item.id],
      locator: null,
    })),
    placement: "note",
  });
  if (!outcome.ok) {
    return {
      status: "failed",
      failure: "engine-failed",
      message: `The citation engine failed while building the bibliography (${outcome.stage}).`,
    };
  }
  return {
    status: "ok",
    heading: style.bibliographyHeading,
    entries: outcome.bibliography,
    omittedFromBibliography: outcome.omittedFromBibliography,
  };
}
