/**
 * @module user-word-list
 *
 * Server-side store for the cross-project user word list (Feature 96, FR-1,
 * FR-2, FR-13, FR-19) on the web/hosted runtime.
 *
 * The list is one JSON array of strings at the **tenant root**, resolved from
 * `resolveProjectsDir()` (ambient `StorageContext.tenantRoot` inside a request
 * scope). No function here takes a path or root: the caller can never choose
 * where the file lives. Same layout and posture as `global-noise-words.ts`:
 * dot-prefixed so `listProjectsCore` skips it, plain array, never routed
 * through project encryption (no project id in the path).
 *
 * Word rules and bounds come from `user-word-list-core.ts`. Each mutation is
 * a read-modify-write under `withFileLock` with the read inside the lock, so
 * concurrent adds of different words both survive. `withFileLock` is the
 * innermost lock: nothing else is taken inside it. A repeat add or an absent
 * remove writes nothing.
 */
import path from "node:path";
import { atomicWriteFile, exists, readFile } from "./io";
import { withFileLock } from "./file-lock";
import { resolveProjectsDir } from "./projects-dir";
import { addWord, removeWord } from "./user-word-list-core";

/** Filename of the user word list; distinct from `.global-noise-words.json`. */
export const USER_WORD_LIST_FILENAME = ".user-word-list.json";

/**
 * The stored list exists but is not valid JSON or not an array of strings.
 * Distinct from a missing file (an empty list): treating corruption as empty
 * would let the next write replace the writer's words.
 */
export class UserWordListFormatError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UserWordListFormatError";
  }
}

function userWordListPath(): string {
  return path.join(resolveProjectsDir(), USER_WORD_LIST_FILENAME);
}

/** Reads the file; the caller decides whether it holds a lock. */
async function readFrom(target: string): Promise<string[]> {
  if (!(await exists(target))) return [];
  const raw = await readFile(target, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new UserWordListFormatError(
      "The user word list is not valid JSON. Refusing to treat a corrupt file as an empty list.",
      { cause: error },
    );
  }
  if (!Array.isArray(parsed) || !parsed.every((w) => typeof w === "string")) {
    throw new UserWordListFormatError(
      "The user word list is not a JSON array of strings.",
    );
  }
  return parsed;
}

async function mutate(
  change: (current: string[]) => string[],
): Promise<string[]> {
  const target = userWordListPath();
  return withFileLock(target, async () => {
    const current = await readFrom(target);
    const next = change(current);
    if (next === current) return current;
    await atomicWriteFile(target, JSON.stringify(next, null, 2), {
      writeOptions: "utf8",
      durable: process.env.GETWRITE_DURABLE_META === "1",
    });
    return next;
  });
}

/**
 * Reads the user word list for the active tenant.
 *
 * @returns The stored words, or `[]` when no file exists yet.
 * @throws UserWordListFormatError When the file is corrupt.
 */
export async function readUserWords(): Promise<string[]> {
  return readFrom(userWordListPath());
}

/**
 * Adds one word and returns the persisted list. Idempotent.
 *
 * @throws UserWordListError For an invalid, too long word or a full list; the
 *   file is untouched.
 * @throws UserWordListFormatError When the stored file is corrupt.
 */
export async function addUserWord(word: unknown): Promise<string[]> {
  return mutate((current) => addWord(current, word));
}

/**
 * Removes one word and returns the persisted list. Idempotent.
 *
 * @throws UserWordListError For an invalid or too long word; file untouched.
 * @throws UserWordListFormatError When the stored file is corrupt.
 */
export async function removeUserWord(word: unknown): Promise<string[]> {
  return mutate((current) => removeWord(current, word));
}
