/**
 * @module spell-constants
 *
 * Constants the main thread needs from the spell-check engine's package. They
 * live here, apart from `engine-nspell.ts`, so importing one does not pull the
 * engine into the editor bundle (FR-21: the main thread never loads it).
 */

/**
 * Quiet time after an edit before the editor posts a check, in milliseconds.
 * Set from the Part 0 figures for this engine (`experiments.md`, Task 31
 * section): a whole-document check measured at most 224.8 ms (200,000 words,
 * Android), and re-checking one paragraph at most 0.7 ms. The Decision sets no
 * performance limit.
 */
export const SPELL_DEBOUNCE_MS = 300;
