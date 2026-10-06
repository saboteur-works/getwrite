/**
 * @module project-noise-words-core
 *
 * Transport-agnostic core for a project's two noise-word lists (Entity
 * Mention Noise Flagging, Task 6):
 *
 * - `config.customNoiseWords` (FR-3) — writer-authored words that should
 *   always be flagged as noise for this project, regardless of the global
 *   list.
 * - `config.excludedGlobalNoiseWords` (FR-6) — specific words from the
 *   cross-project global list (Task 8/9/10) this project opts out of.
 *
 * Both fields already exist on `ProjectConfigSchema` (Tasks 2-3), validated
 * as `z.array(z.string().trim().min(1)).optional()`.
 *
 * Mirrors `word-count-goal-core.ts`/`entity-graph-settings-core.ts` exactly:
 * reads `project.json` directly, does a read-modify-write inside
 * `withMetaLock`, and uses `atomicWriteFile` with the same options.
 * Locked/keyless-project errors are NOT caught here — they propagate up
 * unchanged from whatever throws inside (`readFile`/`atomicWriteFile` going
 * through `io.ts`).
 *
 * Unlike `global-noise-words.ts`'s cross-project list (which only offers a
 * whole-list replace, leaving de-duplication to the caller), this module
 * additionally offers add/remove helpers for individual words on either
 * list, per Task 6's done-when — each is idempotent: adding a word already
 * present, or removing one that is absent, is a no-op rather than an error.
 */
import path from "node:path";
import { atomicWriteFile, readFile } from "./io";
import { withMetaLock } from "./meta-locks";
import { resolveProjectRoot } from "./project-root-resolver";
import { InvalidProjectIdCoreError } from "./project-crud-core";
import { PROJECT_FILENAME } from "./project-config";

export { InvalidProjectIdCoreError };

/** A project's two noise-word lists, defaults filled in (`[]` when absent). */
export interface NoiseWordLists {
  customNoiseWords: string[];
  excludedGlobalNoiseWords: string[];
}

/** The requested word is not a non-empty string (after trimming). Map to HTTP 400. */
export class InvalidNoiseWordError extends Error {
  constructor(value: unknown) {
    super(
      `Invalid noise word: ${JSON.stringify(value)} (must be a non-empty string)`,
    );
    this.name = "InvalidNoiseWordError";
  }
}

function requireProjectRoot(projectId: string): string {
  const root = resolveProjectRoot(projectId);
  if (!root) throw new InvalidProjectIdCoreError(projectId);
  return root;
}

/** Validates and trims a candidate word. @throws InvalidNoiseWordError */
function requireNoiseWord(word: unknown): string {
  if (typeof word !== "string" || word.trim().length === 0) {
    throw new InvalidNoiseWordError(word);
  }
  return word.trim();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Reads the two noise-word lists out of a raw `config` object, defaulting absent fields to `[]`. */
function extractLists(config: Record<string, unknown>): NoiseWordLists {
  const customNoiseWords = Array.isArray(config.customNoiseWords)
    ? (config.customNoiseWords as unknown[]).filter(isNonEmptyString)
    : [];
  const excludedGlobalNoiseWords = Array.isArray(
    config.excludedGlobalNoiseWords,
  )
    ? (config.excludedGlobalNoiseWords as unknown[]).filter(isNonEmptyString)
    : [];
  return { customNoiseWords, excludedGlobalNoiseWords };
}

async function readRawConfig(
  projectRoot: string,
): Promise<Record<string, unknown>> {
  const file = path.join(projectRoot, PROJECT_FILENAME);
  const raw = await readFile(file, "utf8");
  const project = JSON.parse(raw) as { config?: Record<string, unknown> };
  return project.config ?? {};
}

/**
 * Reads the project's two noise-word lists, defaults (`[]`) filled in.
 *
 * @throws InvalidProjectIdCoreError; locked-access errors are rethrown
 *   unchanged.
 */
export async function getNoiseWordListsCore(
  projectId: string,
): Promise<NoiseWordLists> {
  const projectRoot = requireProjectRoot(projectId);
  const config = await readRawConfig(projectRoot);
  return extractLists(config);
}

/**
 * Runs a read-modify-write over `project.json`'s `config`, under
 * `withMetaLock`, returning the resulting noise-word lists. `mutate` is given
 * the current lists and returns the updated ones to persist.
 */
async function mutateNoiseWordLists(
  projectRoot: string,
  mutate: (current: NoiseWordLists) => NoiseWordLists,
): Promise<NoiseWordLists> {
  const file = path.join(projectRoot, PROJECT_FILENAME);
  return withMetaLock(projectRoot, async () => {
    const raw = await readFile(file, "utf8");
    const project = JSON.parse(raw) as { config?: Record<string, unknown> };
    const config = { ...(project.config ?? {}) };
    const updated = mutate(extractLists(config));
    config.customNoiseWords = updated.customNoiseWords;
    config.excludedGlobalNoiseWords = updated.excludedGlobalNoiseWords;
    await atomicWriteFile(
      file,
      JSON.stringify({ ...project, config }, null, 2),
      {
        writeOptions: "utf8",
        durable: process.env.GETWRITE_DURABLE_META === "1",
      },
    );
    return updated;
  });
}

/**
 * Adds `word` to `config.customNoiseWords` (FR-3) if not already present.
 * Touches no other config key.
 *
 * @throws InvalidNoiseWordError, InvalidProjectIdCoreError; locked-access
 *   errors are rethrown unchanged.
 */
export async function addCustomNoiseWordCore(
  projectId: string,
  word: unknown,
): Promise<NoiseWordLists> {
  const projectRoot = requireProjectRoot(projectId);
  const trimmed = requireNoiseWord(word);
  return mutateNoiseWordLists(projectRoot, (current) => ({
    ...current,
    customNoiseWords: current.customNoiseWords.includes(trimmed)
      ? current.customNoiseWords
      : [...current.customNoiseWords, trimmed],
  }));
}

/**
 * Removes `word` from `config.customNoiseWords` (FR-3), a no-op if absent.
 * Touches no other config key.
 *
 * @throws InvalidNoiseWordError, InvalidProjectIdCoreError; locked-access
 *   errors are rethrown unchanged.
 */
export async function removeCustomNoiseWordCore(
  projectId: string,
  word: unknown,
): Promise<NoiseWordLists> {
  const projectRoot = requireProjectRoot(projectId);
  const trimmed = requireNoiseWord(word);
  return mutateNoiseWordLists(projectRoot, (current) => ({
    ...current,
    customNoiseWords: current.customNoiseWords.filter((w) => w !== trimmed),
  }));
}

/**
 * Adds `word` to `config.excludedGlobalNoiseWords` (FR-6) if not already
 * present. Touches no other config key.
 *
 * @throws InvalidNoiseWordError, InvalidProjectIdCoreError; locked-access
 *   errors are rethrown unchanged.
 */
export async function excludeGlobalNoiseWordCore(
  projectId: string,
  word: unknown,
): Promise<NoiseWordLists> {
  const projectRoot = requireProjectRoot(projectId);
  const trimmed = requireNoiseWord(word);
  return mutateNoiseWordLists(projectRoot, (current) => ({
    ...current,
    excludedGlobalNoiseWords: current.excludedGlobalNoiseWords.includes(trimmed)
      ? current.excludedGlobalNoiseWords
      : [...current.excludedGlobalNoiseWords, trimmed],
  }));
}

/**
 * Removes `word` from `config.excludedGlobalNoiseWords` (FR-6), a no-op if
 * absent. Touches no other config key.
 *
 * @throws InvalidNoiseWordError, InvalidProjectIdCoreError; locked-access
 *   errors are rethrown unchanged.
 */
export async function unexcludeGlobalNoiseWordCore(
  projectId: string,
  word: unknown,
): Promise<NoiseWordLists> {
  const projectRoot = requireProjectRoot(projectId);
  const trimmed = requireNoiseWord(word);
  return mutateNoiseWordLists(projectRoot, (current) => ({
    ...current,
    excludedGlobalNoiseWords: current.excludedGlobalNoiseWords.filter(
      (w) => w !== trimmed,
    ),
  }));
}
