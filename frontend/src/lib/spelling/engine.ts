/**
 * @module engine
 *
 * The engine-agnostic seam of the spell checker (FR-21, FR-23). Everything
 * outside the worker is written against the protocol in `worker-protocol.ts`;
 * only the worker holds a `SpellEngine`. An adapter for the chosen engine
 * implements this type and is the only module that imports the engine package.
 */

/** Suggestions returned for one word, at most. */
export const MAX_SUGGESTIONS = 5;

/** A spelling engine as the worker sees it. Never used on the main thread. */
export interface SpellEngine {
  /**
   * Loads the engine and its dictionary. Rejects when either cannot load;
   * the worker reports that as an `error` reply, never as a ready engine.
   */
  load(): Promise<void>;
  /** True when the word is in the dictionary. Throws when the engine fails. */
  isCorrect(word: string): boolean;
  /** Up to `max` suggestions for a misspelling. Throws when the engine fails. */
  suggest(word: string, max: number): string[];
}
