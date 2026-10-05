/**
 * @module entity-noise-check
 *
 * Shared noise-check core for the entity-mention-noise-flagging feature
 * (FR-1, FR-7, FR-8, FR-13). Renamed from `entity-alias-warnings.ts`
 * (Task 5): the predecessor's `getAliasWarning` only ever checked an
 * entity's `aliases`; this module applies the identical check to both an
 * entity's `name` and its `aliases` via the FR-7 union/exclusion formula,
 * and additionally supports FR-8/FR-13 per-entity-per-term dismissal
 * suppression. Every call site of the old `getAliasWarning` (grep found
 * `EntitySection.tsx`, `EntityRosterView.tsx`,
 * `entityHighlightDecoration.ts`, and the unit test file, now
 * `entity-noise-check.test.ts`) has been updated to import from here.
 *
 * `checkNoiseFlag` is the single function later tasks (6, 7, 11, 14, 15)
 * build on. It returns `true` when `term` should be flagged as noise-prone,
 * `false` otherwise — a plain boolean rather than a message string, so the
 * caller decides what copy to show (see `entity-noise-copy.ts`'s
 * `getNoiseObservation`, Task 4) based on whether it's checking a `name` or
 * an `alias`. It never throws and never mutates its input, mirroring
 * `getAliasWarning`'s prior contract.
 *
 * ## FR-7 union/exclusion formula
 *
 * A term is flagged if, after normalization (trim + lowercase — the same
 * normalization `getAliasWarning` used), EITHER:
 *   - it is shorter than `MIN_NOISE_TERM_LENGTH` characters (the same
 *     threshold and mechanism the predecessor used — an independent
 *     OR-condition, not folded into the list union below), OR
 *   - it is a member of:
 *       bundled ∪ projectCustom ∪ global  MINUS  projectExcludedGlobal
 *     where `bundled` is `BUNDLED_NOISE_WORDS` (Task 1), `projectCustom` is
 *     the project's `customNoiseWords` (Task 2), `global` is the caller-
 *     resolved global noise-word list (Task 11's transport concern — this
 *     module only ever consumes the resulting plain `string[]`), and
 *     `projectExcludedGlobal` is the project's `excludedGlobalNoiseWords`
 *     (Task 2).
 *
 * This runs identically for a `name` and an `alias` (FR-1): the function
 * takes no `kind` parameter and never branches on one. The caller decides
 * which field it's checking; the matching logic itself is unaware of the
 * distinction.
 *
 * ## FR-8/FR-13 dismissal
 *
 * `sources.dismissedNoiseTerms` is one entity's own dismissed-terms set
 * (its sidecar's `dismissedNoiseTerms`, already read by the caller before
 * calling this function). A term whose normalized form is in that set is
 * never flagged, regardless of the union formula above — but only for the
 * identical normalized text: editing a dismissed term's text produces a
 * different normalized string that is not in the dismissed set, so the
 * observation resurfaces (FR-13).
 */

import { BUNDLED_NOISE_WORDS } from "./bundled-noise-words";

/** Minimum term length, in characters, below which a term is flagged as too
 * short to be a reliable, low-noise match. Same threshold and mechanism the
 * predecessor `getAliasWarning` used. */
const MIN_NOISE_TERM_LENGTH = 3;

/** Normalizes a term for list-membership and dismissal comparison: trimmed,
 * lowercased. Dismissal comparisons use this same normalization so
 * dismissing "Case" suppresses "case"/"CASE"/etc. (FR-13). */
function normalizeNoiseTerm(term: string): string {
  return term.trim().toLowerCase();
}

/** Module-scoped normalized form of the bundled list, built once. */
const NORMALIZED_BUNDLED_NOISE_WORDS: ReadonlySet<string> = new Set(
  BUNDLED_NOISE_WORDS.map(normalizeNoiseTerm),
);

/**
 * The data sources a caller supplies to {@link checkNoiseFlag} beyond the
 * term itself. Every field is optional and defaults to empty — a caller
 * with no project/global/dismissal data available yet (e.g. ahead of
 * Tasks 6/7/11 wiring it up) gets exactly the predecessor's short-length +
 * bundled-list behavior.
 */
export interface NoiseCheckSources {
  /** The project's custom noise-word list (`config.customNoiseWords`,
   * Task 2/6). */
  projectCustomNoiseWords?: string[];
  /** The project's excluded-global-words list
   * (`config.excludedGlobalNoiseWords`, Task 2/6). */
  projectExcludedGlobalNoiseWords?: string[];
  /** The resolved, cross-project global noise-word list (Task 11's
   * transport concern — this module only ever consumes the resulting
   * `string[]`). */
  globalNoiseWords?: string[];
  /** This one entity's own dismissed-terms set (its sidecar's
   * `dismissedNoiseTerms`, FR-8/FR-13). */
  dismissedNoiseTerms?: string[];
}

/**
 * Flags `term` (an entity's `name` or one of its `aliases`, FR-1) as
 * noise-prone per the FR-7 union/exclusion formula, with FR-8/FR-13
 * dismissal suppression.
 *
 * @param term - The candidate term text, as typed/stored by the user.
 * @param sources - Project/global/dismissal data; see
 *   {@link NoiseCheckSources}. Defaults to empty when omitted.
 * @returns `true` if the term should be flagged, `false` otherwise.
 */
export function checkNoiseFlag(
  term: string,
  sources: NoiseCheckSources = {},
): boolean {
  const normalized = normalizeNoiseTerm(term);

  const dismissed = new Set(
    (sources.dismissedNoiseTerms ?? []).map(normalizeNoiseTerm),
  );
  if (dismissed.has(normalized)) {
    return false;
  }

  if (normalized.length < MIN_NOISE_TERM_LENGTH) {
    return true;
  }

  const union = new Set<string>(NORMALIZED_BUNDLED_NOISE_WORDS);
  for (const word of sources.projectCustomNoiseWords ?? []) {
    union.add(normalizeNoiseTerm(word));
  }
  for (const word of sources.globalNoiseWords ?? []) {
    union.add(normalizeNoiseTerm(word));
  }
  for (const word of sources.projectExcludedGlobalNoiseWords ?? []) {
    union.delete(normalizeNoiseTerm(word));
  }

  return union.has(normalized);
}
