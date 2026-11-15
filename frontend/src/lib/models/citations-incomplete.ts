/**
 * @module citations-incomplete
 *
 * Feature 116 (citations at compile), FR-15: the visible marker of an
 * incomplete citation. A citation that cannot be rendered in full (a removed
 * Source, a Source with no fields, a Source missing a required detail) keeps
 * what the engine gave and ends with `[citation incomplete: <Source name>]`.
 *
 * - The same text for every format, style and gap kind; the citation is never
 *   skipped and nothing here can refuse a compile.
 * - The name is the gap's `sourceName`, which the render pass takes from the
 *   saved target name or the Source's current one (the
 *   `deriveCitationTargetState(...).displayName` rule); absent or empty gives
 *   the literal "unnamed Source".
 * - The output is formatting runs. The marker is one plain run (no link, no
 *   emphasis), so the name stays literal text; each renderer escapes run text
 *   for its own format like any other name.
 * - `renderIncompleteCitation` has the signature of the `renderIncomplete`
 *   hook of `citations-render.ts`.
 *
 * No React, JSX, JSON or `node:*` import.
 */
import type { CitationRun } from "../citations/citation-engine";
import type { CitationGap } from "./citations-types";

/** Shown when no Source name is known. */
export const UNNAMED_SOURCE = "unnamed Source";

/** The marker text for a Source name (undefined or empty: unnamed). */
export function incompleteMarker(name: string | undefined): string {
  const shown = name === undefined || name === "" ? UNNAMED_SOURCE : name;
  return `[citation incomplete: ${shown}]`;
}

/**
 * The runs of an incomplete citation: the engine's runs (empty when the
 * Source has no item) followed by the plain marker run, set off by a space
 * when there is something before it. Pure; the input is not changed.
 */
export function renderIncompleteCitation(
  gap: CitationGap,
  engineRuns: readonly CitationRun[],
): CitationRun[] {
  const marker = incompleteMarker(gap.sourceName);
  return [
    ...engineRuns,
    { text: engineRuns.length === 0 ? marker : ` ${marker}` },
  ];
}
