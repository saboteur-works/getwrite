/**
 * Pure core of the user word list (Feature 96, FR-2, FR-13, FR-19).
 *
 * Used by the server store, the Electron main handler and the Android
 * backend, so it touches no `fs` and no `window`. Word rules and bounds come
 * from `spelling-word-rules.ts`, the same module the project lists use
 * (`project-spelling-core.ts`), so they cannot drift.
 *
 * `addWord` / `removeWord` are idempotent: a repeat returns the very same
 * array (so a caller can skip the write). Order is insertion order and
 * duplicates are detected on a case fold keeping the first spelling, as in the
 * project lists. A refusal throws `UserWordListError` with a distinct
 * `reason`; it never returns an empty list in place of a failure.
 */
import {
  MAX_SPELLING_LIST_SIZE,
  checkSpellingWord,
  foldSpellingWord,
} from "./spelling-word-rules";

export type UserWordListErrorReason = "invalid-word" | "too-long" | "list-full";

/** A word or list-size refusal. `reason` says which. */
export class UserWordListError extends Error {
  readonly reason: UserWordListErrorReason;

  constructor(reason: UserWordListErrorReason, message: string) {
    super(message);
    this.name = "UserWordListError";
    this.reason = reason;
  }
}

function requireWord(word: unknown): string {
  const checked = checkSpellingWord(word);
  if (checked.ok) return checked.word;
  if (checked.reason === "too-long") {
    throw new UserWordListError(
      "too-long",
      "The word is too long for the word list",
    );
  }
  throw new UserWordListError(
    "invalid-word",
    "The word must be a string with no whitespace or control characters",
  );
}

/**
 * Returns the list with `word` added, or the same array if already present.
 *
 * @throws UserWordListError `invalid-word`, `too-long`, or `list-full`.
 */
export function addWord(list: readonly string[], word: unknown): string[] {
  const validated = requireWord(word);
  const folded = foldSpellingWord(validated);
  if (list.some((w) => foldSpellingWord(w) === folded)) {
    return list as string[];
  }
  if (list.length >= MAX_SPELLING_LIST_SIZE) {
    throw new UserWordListError(
      "list-full",
      `The word list is full (${MAX_SPELLING_LIST_SIZE} words)`,
    );
  }
  return [...list, validated];
}

/**
 * Returns the list without `word`, or the same array if absent.
 *
 * @throws UserWordListError `invalid-word` or `too-long`.
 */
export function removeWord(list: readonly string[], word: unknown): string[] {
  const folded = foldSpellingWord(requireWord(word));
  const next = list.filter((w) => foldSpellingWord(w) !== folded);
  return next.length === list.length ? (list as string[]) : next;
}
