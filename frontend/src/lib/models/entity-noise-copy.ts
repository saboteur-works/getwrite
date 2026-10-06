/**
 * @module entity-noise-copy
 *
 * Approved observation copy for the entity-mention noise check (FR-10,
 * "entity-mention-noise-flagging"). This module IS the FR-10 "lightweight
 * copy-review step" deliverable: the strings below are final and approved,
 * not placeholders awaiting a later human review pass (there is no human
 * reviewer in this pipeline — see the feature spec's FR-10 and the
 * corresponding task breakdown). They replace `entity-alias-warnings.ts`'s
 * existing directive-leaning strings ("will match frequently and add
 * noise") and extend the same tone to the newly-covered `name` case (FR-1).
 *
 * Tone requirements (FR-10/FR-11): non-imperative, neutral-aside phrasing
 * that states a fact about the term — that it also reads as an ordinary
 * word, so some detected matches may not be about this entity — rather than
 * an instruction to the writer ("fix this," "remove this," "will cause
 * problems"). No red/alert styling is implied by this copy; that is a
 * rendering concern for the surfaces that consume it (`EntitySection.tsx`,
 * `EntityRosterView.tsx`), not this module.
 *
 * `getNoiseObservation` unifies the name and alias cases into one template
 * rather than two hand-written strings: the two cases differ only in which
 * noun ("name" / "alias") describes the flagged term, and keeping them on
 * one template guarantees the rest of the sentence can never drift between
 * the two surfaces as the copy is revised in the future.
 */

/** The kind of term a noise observation is being produced for. */
export type NoiseTermKind = "name" | "alias";

/**
 * Returns the approved, non-imperative observation copy for a term flagged
 * as noise-prone (per the union of noise sources in FR-7), naming the term
 * itself so the writer can tell at a glance which word is being described.
 *
 * @param term - The flagged term's original (non-normalized) text, as
 *   entered by the writer.
 * @param kind - Whether the flagged term is the entity's `name` or one of
 *   its `aliases`.
 */
export function getNoiseObservation(term: string, kind: NoiseTermKind): string {
  return `"${term}" also reads as a common English word or name, so this ${kind} may produce detected matches that aren't about this entity.`;
}

/**
 * The approved observation copy for a flagged entity `name` (FR-1, FR-10).
 * Prefer `getNoiseObservation(term, "name")` when the term is known; this
 * constant is provided for surfaces that need the generic, term-agnostic
 * phrasing (e.g. static copy review, documentation).
 */
export const NOISE_OBSERVATION_NAME: string =
  "This name also reads as a common English word or name, so some detected matches may not be about this entity.";

/**
 * The approved observation copy for a flagged entity `alias` (FR-10),
 * replacing `entity-alias-warnings.ts`'s prior directive-leaning strings.
 * Prefer `getNoiseObservation(term, "alias")` when the term is known; this
 * constant is provided for surfaces that need the generic, term-agnostic
 * phrasing (e.g. static copy review, documentation).
 */
export const NOISE_OBSERVATION_ALIAS: string =
  "This alias also reads as a common English word or name, so some detected matches may not be about this entity.";
