/**
 * @module native-user-word-list
 *
 * **User word list, Task 6 (FR-1, FR-2, FR-13, FR-19).** The native Android
 * runtime's device-level user spelling word list: a single app-private,
 * unencrypted JSON array of strings at `/user-word-list.json` (relative to
 * `Directory.Data`), read and written directly against the Capacitor
 * Filesystem plugin, never through `io.ts`, `storage-context.ts` or
 * `capacitorFsAdapter.ts`. Same posture as `native-global-noise-words.ts`,
 * and a deliberately separate file from `/global-noise-words.json`.
 *
 * Add and remove are read-modify-write here, using the pure core
 * (`user-word-list-core.ts`) for word validation, bounds and idempotence.
 * Calls are serialized through an in-process queue so two overlapping calls
 * cannot lose a word.
 *
 * Unlike the noise-word store, a read never degrades: a file that is not a
 * JSON array of strings throws, so a damaged file cannot look like an empty
 * list (`docs/standards/failure-visibility.md`). Only a missing file (first
 * run) reads as `[]`.
 *
 * **Native-only.** Reaches `@capacitor/filesystem` only through a dynamic
 * `import()`; never import this from the web/desktop client bundle.
 */
import {
  FsEncoding,
  type CapacitorFilesystemLike,
} from "./capacitor-filesystem";
import { addWord, removeWord } from "./user-word-list-core";

/** Device-level path, a sibling of `/projects` and `/global-noise-words.json`. */
export const USER_WORD_LIST_PATH = "/user-word-list.json";

let cachedFs: CapacitorFilesystemLike | null = null;
let queueTail: Promise<unknown> = Promise.resolve();

async function resolveFs(): Promise<CapacitorFilesystemLike> {
  if (!cachedFs) {
    const { Directory } = await import("@capacitor/filesystem");
    const { createRealCapacitorFilesystem } =
      await import("./capacitor-filesystem-real");
    cachedFs = createRealCapacitorFilesystem(Directory.Data);
  }
  return cachedFs;
}

/** Detects the plugin's message-only "not found" failure (no `code` field). */
function isNotFoundError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return /does not exist/i.test(message);
  }
  return false;
}

async function readList(fs: CapacitorFilesystemLike): Promise<string[]> {
  let raw: string;
  try {
    const { data } = await fs.readFile({
      path: USER_WORD_LIST_PATH,
      encoding: FsEncoding.UTF8,
    });
    raw = data;
  } catch (err) {
    if (isNotFoundError(err)) return [];
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The user word list file is not valid JSON");
  }
  if (
    !Array.isArray(parsed) ||
    !parsed.every((entry) => typeof entry === "string")
  ) {
    throw new Error("The user word list file is not an array of strings");
  }
  return parsed as string[];
}

/** Runs `task` after every earlier queued task has settled. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queueTail.then(task, task);
  queueTail = run.catch(() => undefined);
  return run;
}

async function mutate(
  change: (list: readonly string[]) => string[],
): Promise<string[]> {
  const fs = await resolveFs();
  const current = await readList(fs);
  const next = change(current);
  if (next !== current) {
    await fs.writeFile({
      path: USER_WORD_LIST_PATH,
      data: JSON.stringify(next),
      encoding: FsEncoding.UTF8,
    });
  }
  return next;
}

/**
 * Reads the user word list.
 *
 * @returns The persisted list, `[]` only when no file exists yet.
 * @throws When the file is unreadable or not a JSON array of strings.
 */
export async function getNativeUserWords(): Promise<string[]> {
  return enqueue(async () => readList(await resolveFs()));
}

/**
 * Adds a word (idempotent) and returns the persisted list.
 *
 * @throws UserWordListError for a refused word; any read error.
 */
export function addNativeUserWord(word: unknown): Promise<string[]> {
  return enqueue(() => mutate((list) => addWord(list, word)));
}

/**
 * Removes a word (idempotent) and returns the persisted list.
 *
 * @throws UserWordListError for a refused word; any read error.
 */
export function removeNativeUserWord(word: unknown): Promise<string[]> {
  return enqueue(() => mutate((list) => removeWord(list, word)));
}

/** Test-only reset of the memoized plugin handle and the write queue. */
export function __resetNativeUserWordListForTests(): void {
  cachedFs = null;
  queueTail = Promise.resolve();
}
