/**
 * Pure spelling-word rules shared by the project lists
 * (`project-spelling-core.ts`) and the user word list
 * (`user-word-list-core.ts`, Feature 96). No `fs`, no `window`, so every
 * platform can import it and the bounds cannot drift between lists.
 *
 * A word is NFC-normalised and trimmed, then must be 1 to
 * `MAX_SPELLING_WORD_LENGTH` UTF-16 code units with no whitespace or control
 * character inside.
 */

/** Maximum length of one spelling word, in UTF-16 code units (FR-13, OQ-10). */
export const MAX_SPELLING_WORD_LENGTH = 100;

/** Maximum number of words held in each spelling list (FR-13, OQ-10). */
export const MAX_SPELLING_LIST_SIZE = 5000;

const INNER_WHITESPACE = /\s/u;
const CONTROL_CHARACTER = /\p{Cc}/u;

/** Why a candidate word was refused. */
export type SpellingWordRefusal = "invalid-word" | "too-long";

export type SpellingWordCheck =
  | { ok: true; word: string }
  | { ok: false; reason: SpellingWordRefusal };

/** Validates, NFC-normalises and trims a candidate word. Never throws. */
export function checkSpellingWord(word: unknown): SpellingWordCheck {
  if (typeof word !== "string") return { ok: false, reason: "invalid-word" };
  const normalised = word.normalize("NFC").trim();
  if (normalised.length > MAX_SPELLING_WORD_LENGTH) {
    return { ok: false, reason: "too-long" };
  }
  if (
    normalised.length === 0 ||
    INNER_WHITESPACE.test(normalised) ||
    CONTROL_CHARACTER.test(normalised)
  ) {
    return { ok: false, reason: "invalid-word" };
  }
  return { ok: true, word: normalised };
}

/** Locale-independent fold used to detect duplicates. */
export function foldSpellingWord(word: string): string {
  return word.normalize("NFC").toLowerCase();
}
