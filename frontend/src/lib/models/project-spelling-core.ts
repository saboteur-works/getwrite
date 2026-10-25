/**
 * Project spelling word lists (spell-checker FR-11, FR-13).
 *
 * `config.spellingProjectWords` ("Add to project dictionary") and
 * `config.spellingIgnoredWords` ("Ignore") are writer-authored string lists in
 * `project.json`. This module currently holds the two bounds applied to them;
 * the core that reads and mutates the lists is added alongside.
 */

/** Maximum length of one spelling word, in UTF-16 code units (FR-13, OQ-10). */
export const MAX_SPELLING_WORD_LENGTH = 100;

/** Maximum number of words held in each spelling list (FR-13, OQ-10). */
export const MAX_SPELLING_LIST_SIZE = 5000;
