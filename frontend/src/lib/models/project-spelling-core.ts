/**
 * Project spelling word lists (spell-checker FR-11, FR-13).
 *
 * `config.spellingProjectWords` ("Add to project dictionary") and
 * `config.spellingIgnoredWords` ("Ignore") are writer-authored string lists in
 * `project.json`. This module holds the bounds applied to them and the
 * transport-agnostic core that reads and mutates them (FR-12, FR-13, AC-6).
 *
 * Mirrors `project-noise-words-core.ts`: each mutation is a read-modify-write
 * inside `withMetaLock` and `updateProjectJson` (the per-file lock, with the
 * `durable` option). Locked-access errors are not caught; they propagate
 * unchanged. Every mutation is idempotent (a repeat is a no-op, not an error,
 * and writes nothing) and returns both lists. The two lists are independent:
 * a word added to one is never removed from the other.
 *
 * A word is NFC-normalised and trimmed, then must be 1 to
 * `MAX_SPELLING_WORD_LENGTH` UTF-16 code units with no whitespace or control
 * character inside. Duplicates are detected on a locale-independent
 * lower-cased fold; the first stored spelling is kept.
 */
import path from "node:path";
import { readFile } from "./io";
import { withMetaLock } from "./meta-locks";
import { updateProjectJson } from "./project-json-write";
import type { ProjectConfig } from "./types";
import { resolveProjectRoot } from "./project-root-resolver";
import { InvalidProjectIdCoreError } from "./project-crud-core";
import { PROJECT_FILENAME } from "./project-config";

export { InvalidProjectIdCoreError };

/** Maximum length of one spelling word, in UTF-16 code units (FR-13, OQ-10). */
export const MAX_SPELLING_WORD_LENGTH = 100;

/** Maximum number of words held in each spelling list (FR-13, OQ-10). */
export const MAX_SPELLING_LIST_SIZE = 5000;

/** A project's two spelling lists, defaults filled in (`[]` when absent). */
export interface SpellingLists {
  spellingProjectWords: string[];
  spellingIgnoredWords: string[];
}

type SpellingListKey = keyof SpellingLists;

/** The word is not a valid spelling word. Map to HTTP 400. */
export class InvalidSpellingWordError extends Error {
  constructor(value: unknown) {
    super(
      `Invalid spelling word: ${JSON.stringify(value)} (must be a string of 1 to ${MAX_SPELLING_WORD_LENGTH} characters with no whitespace or control characters)`,
    );
    this.name = "InvalidSpellingWordError";
  }
}

/** The list already holds `MAX_SPELLING_LIST_SIZE` words. Map to HTTP 400. */
export class SpellingListFullError extends Error {
  constructor(key: SpellingListKey) {
    super(
      `The ${key} list is full (${MAX_SPELLING_LIST_SIZE} words); remove one before adding another`,
    );
    this.name = "SpellingListFullError";
  }
}

const INNER_WHITESPACE = /\s/u;
const CONTROL_CHARACTER = /\p{Cc}/u;

function requireProjectRoot(projectId: string): string {
  const root = resolveProjectRoot(projectId);
  if (!root) throw new InvalidProjectIdCoreError(projectId);
  return root;
}

/** Validates, NFC-normalises and trims a candidate word. @throws InvalidSpellingWordError */
function requireSpellingWord(word: unknown): string {
  if (typeof word !== "string") throw new InvalidSpellingWordError(word);
  const normalised = word.normalize("NFC").trim();
  if (
    normalised.length === 0 ||
    normalised.length > MAX_SPELLING_WORD_LENGTH ||
    INNER_WHITESPACE.test(normalised) ||
    CONTROL_CHARACTER.test(normalised)
  ) {
    throw new InvalidSpellingWordError(word);
  }
  return normalised;
}

/** Locale-independent fold used to detect duplicates. */
function fold(word: string): string {
  return word.normalize("NFC").toLowerCase();
}

function readList(config: Record<string, unknown>, key: SpellingListKey) {
  const value = config[key];
  return Array.isArray(value)
    ? (value as unknown[]).filter(
        (w): w is string => typeof w === "string" && w.trim().length > 0,
      )
    : [];
}

function extractLists(config: Record<string, unknown>): SpellingLists {
  return {
    spellingProjectWords: readList(config, "spellingProjectWords"),
    spellingIgnoredWords: readList(config, "spellingIgnoredWords"),
  };
}

/**
 * Reads the project's two spelling lists, defaults (`[]`) filled in.
 *
 * @throws InvalidProjectIdCoreError; locked-access errors are rethrown
 *   unchanged.
 */
export async function getSpellingListsCore(
  projectId: string,
): Promise<SpellingLists> {
  const projectRoot = requireProjectRoot(projectId);
  const raw = await readFile(path.join(projectRoot, PROJECT_FILENAME), "utf8");
  const project = JSON.parse(raw) as { config?: Record<string, unknown> };
  return extractLists(project.config ?? {});
}

/**
 * Read-modify-write of one list under `withMetaLock` and the per-file lock.
 * `change` returns the new list, or `null` for a no-op, which writes nothing.
 * Only the one list's key is set; no other part of `project.json` changes.
 */
async function mutateList(
  projectId: string,
  key: SpellingListKey,
  word: unknown,
  change: (current: string[], word: string) => string[] | null,
): Promise<SpellingLists> {
  const projectRoot = requireProjectRoot(projectId);
  const validated = requireSpellingWord(word);
  return withMetaLock(projectRoot, () =>
    updateProjectJson<SpellingLists>(
      projectRoot,
      (project) => {
        const config: Record<string, unknown> = { ...(project.config ?? {}) };
        const lists = extractLists(config);
        const next = change(lists[key], validated);
        if (next === null) return { result: lists, shouldWrite: false };
        config[key] = next;
        project.config = config as unknown as ProjectConfig;
        return { result: { ...lists, [key]: next } };
      },
      { durable: process.env.GETWRITE_DURABLE_META === "1" },
    ),
  );
}

function appendTo(key: SpellingListKey) {
  return (current: string[], word: string): string[] | null => {
    const folded = fold(word);
    if (current.some((w) => fold(w) === folded)) return null;
    if (current.length >= MAX_SPELLING_LIST_SIZE) {
      throw new SpellingListFullError(key);
    }
    return [...current, word];
  };
}

function removeFrom(current: string[], word: string): string[] | null {
  const folded = fold(word);
  const next = current.filter((w) => fold(w) !== folded);
  return next.length === current.length ? null : next;
}

/**
 * Adds `word` to `config.spellingProjectWords` (FR-12). A case-folded
 * duplicate is a no-op that keeps the stored spelling.
 *
 * @throws InvalidSpellingWordError, SpellingListFullError,
 *   InvalidProjectIdCoreError; locked-access errors are rethrown unchanged.
 */
export function addSpellingWordCore(
  projectId: string,
  word: unknown,
): Promise<SpellingLists> {
  return mutateList(
    projectId,
    "spellingProjectWords",
    word,
    appendTo("spellingProjectWords"),
  );
}

/** Removes `word` from `config.spellingProjectWords`, a no-op if absent. Same errors as add. */
export function removeSpellingWordCore(
  projectId: string,
  word: unknown,
): Promise<SpellingLists> {
  return mutateList(projectId, "spellingProjectWords", word, removeFrom);
}

/** Adds `word` to `config.spellingIgnoredWords` (FR-11). Same rules as add. */
export function ignoreSpellingWordCore(
  projectId: string,
  word: unknown,
): Promise<SpellingLists> {
  return mutateList(
    projectId,
    "spellingIgnoredWords",
    word,
    appendTo("spellingIgnoredWords"),
  );
}

/** Removes `word` from `config.spellingIgnoredWords`, a no-op if absent. Same errors as add. */
export function unignoreSpellingWordCore(
  projectId: string,
  word: unknown,
): Promise<SpellingLists> {
  return mutateList(projectId, "spellingIgnoredWords", word, removeFrom);
}
