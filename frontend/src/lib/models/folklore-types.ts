/**
 * Feature 110 (folklore variants), Task 4: the inert shared contract of the
 * "Narratives" module. Constants and types only; no behaviour, and no React,
 * JSX or JSON, so the CLI and the Electron workers can reach it.
 */

/** Module id of the Narratives module (`config.modules.folklore`). */
export const FOLKLORE_MODULE_ID = "folklore";

/** Label of the module's Work Area view. */
export const FOLKLORE_VIEW_LABEL = "Narratives";

/** Subtype label of a narrative folder. */
export const NARRATIVE_SUBTYPE = "Narrative";

/** Subtype label of a variant (a Source). */
export const VARIANT_SUBTYPE = "Variant";

/** Text shown on a stored tag that is not among the field's current options (FR-10). */
export const NOT_IN_LIST = "not in the list";

/** Text shown for a variant field that has no value (FR-8). */
export const NOT_SET = "not set";

/** Plain message shown in place of the comparison at phone width (FR-18). */
export const COMPARISON_PHONE_MESSAGE =
  "Side-by-side comparison needs a wider screen. You can still open each variant from the list.";

/**
 * Typed result of reading one variant's canonical-revision text (FR-13).
 * A failure never shares a value with the empty outcome.
 *
 * - `text`: the canonical revision's text.
 * - `none`: a Source whose body is empty.
 * - `unreadable`: a failed read or an unusable document, with the reason.
 * - `locked`: the project is locked.
 */
export type VariantTextResult =
  | { kind: "text"; text: string }
  | { kind: "none" }
  | { kind: "unreadable"; reason: string }
  | { kind: "locked" };

/** The writer's remembered picks, per device and project (FR-17). */
export interface FolkloreSelection {
  /** The picked narrative folder id, or null when none is picked. */
  narrativeId: string | null;
  /** The ids of the variants chosen for comparison, in chosen order. */
  variantIds: string[];
}

/**
 * Comparison column limit (FR-12): a number, or null meaning "not yet
 * measured", in which case no refusal is committed.
 */
export type ComparisonColumnLimit = number | null;
