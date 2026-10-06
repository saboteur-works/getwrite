/**
 * @module global-noise-words
 *
 * Persistence for the web/hosted runtime's cross-project "global" custom
 * noise-word list (Entity Mention Noise Flagging, FR-5a / Task 8).
 *
 * The list lives at the **tenant root** — the same directory that contains
 * every project's UUID folder — never inside a single project, since it is
 * explicitly cross-project (FR-5). It is read/written through the existing
 * `io.ts` `StorageAdapter` machinery, with the tenant root resolved via
 * `resolveProjectsDir()` (ambient `StorageContext.tenantRoot` when a request
 * scope is active, falling back to `defaultProjectsDir()` otherwise),
 * exactly as `project-crud-core.ts`'s `listProjectsCore` resolves it.
 *
 * **The leading dot is required.** For a local/desktop/locally-run-web
 * deployment with no hosted auth configured, the resolved tenant root is the
 * single flat shared `defaultProjectsDir()` — the same top-level directory
 * every project's UUID folder lives in. `listProjectsCore()` filters out
 * only dot-prefixed entries from that listing; a non-dot-prefixed stray file
 * there would instead be probed as a project, fail to parse, and get
 * dropped with a `console.warn` on every single `GET /api/projects` call
 * forever. The leading dot mirrors the existing `.getwrite-keyring.json`
 * precedent (`crypto/keyring-store.ts`) at that same top level, which the
 * same filter already exempts.
 *
 * File format: a plain JSON array of strings — no wrapping object — mirroring
 * the bundled frequency list's and the per-project custom list's shape
 * (Task 1 / Task 2). Nothing here is secret, and this file is never routed
 * through project-level encryption: it has no project id in its path, so
 * ADR-022's keyring resolution (which keys off a project id parsed from the
 * path) passes it through unencrypted, the same posture the keyring file
 * itself has.
 */
import path from "node:path";
import { atomicWriteFile, exists, readFile } from "./io";
import { withMetaLock } from "./meta-locks";
import { resolveProjectsDir } from "./projects-dir";

/**
 * Filename of the cross-project global noise-word list.
 *
 * Dot-prefixed so tenant-root directory listings (`listProjectsCore`) skip
 * it by the same convention that already skips `.DS_Store` and
 * `.getwrite-keyring.json`, rather than mistaking it for a project folder.
 */
export const GLOBAL_NOISE_WORDS_FILENAME = ".global-noise-words.json";

/**
 * The persisted global noise-word list file exists but is not valid JSON, or
 * is valid JSON that is not an array of strings. Distinct from "file does not
 * exist yet" (which {@link readGlobalNoiseWords} treats as an empty list) —
 * silently treating corruption as "no list" could lead to overwriting a
 * writer's existing words with an empty one.
 */
export class GlobalNoiseWordsFormatError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GlobalNoiseWordsFormatError";
  }
}

/** One or more entries in the requested word list are not non-empty, trimmed strings. */
export class InvalidGlobalNoiseWordsError extends Error {
  constructor(value: unknown) {
    super(
      `Invalid global noise-word list: ${JSON.stringify(value)} (must be an array of non-empty, trimmed strings)`,
    );
    this.name = "InvalidGlobalNoiseWordsError";
  }
}

function globalNoiseWordsPath(tenantRoot?: string): string {
  return path.join(
    tenantRoot ?? resolveProjectsDir(),
    GLOBAL_NOISE_WORDS_FILENAME,
  );
}

function isNonEmptyTrimmedString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validates a candidate word list, trimming each entry.
 *
 * Mirrors the `config.statuses` / Task 2 validation shape: non-empty,
 * trimmed strings, no other structural constraint.
 *
 * @throws InvalidGlobalNoiseWordsError When `value` is not an array of
 *   non-empty, trimmed strings.
 */
function normalizeWordList(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every(isNonEmptyTrimmedString)) {
    throw new InvalidGlobalNoiseWordsError(value);
  }
  return value.map((word) => word.trim());
}

/**
 * Reads the cross-project global noise-word list.
 *
 * A missing file is a normal, expected state — it simply means no global
 * word has ever been added in this deployment — and yields `[]` rather than
 * throwing or 404ing.
 *
 * @param tenantRoot - Tenant root; defaults to `resolveProjectsDir()`.
 * @returns The persisted list of words, or `[]` when the file is absent.
 * @throws GlobalNoiseWordsFormatError When the file exists but cannot be
 *   parsed as a JSON array of strings.
 */
export async function readGlobalNoiseWords(
  tenantRoot?: string,
): Promise<string[]> {
  const target = globalNoiseWordsPath(tenantRoot);
  if (!(await exists(target))) return [];

  const raw = await readFile(target, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new GlobalNoiseWordsFormatError(
      `Global noise-word list at ${target} is not valid JSON. Refusing to treat a corrupt file as an empty list.`,
      { cause: error },
    );
  }
  if (!Array.isArray(parsed) || !parsed.every((w) => typeof w === "string")) {
    throw new GlobalNoiseWordsFormatError(
      `Global noise-word list at ${target} is not a JSON array of strings.`,
    );
  }
  return parsed;
}

/**
 * Replaces the cross-project global noise-word list in full.
 *
 * Read-modify-write is not needed here — the caller always supplies the full
 * desired list (mirroring `setWordCountGoalCore`'s whole-value-replace
 * shape) — but the write itself is still serialized per tenant root via
 * `withMetaLock`, so two concurrent writers (e.g. a double-submit) resolve in
 * arrival order rather than racing each other's `atomicWriteFile` calls.
 *
 * @param words - The full replacement list; validated as non-empty, trimmed
 *   strings (duplicates are not de-duplicated here — that is a caller/UI
 *   concern, not a persistence-layer one).
 * @param tenantRoot - Tenant root; defaults to `resolveProjectsDir()`.
 * @returns The persisted (trimmed) list.
 * @throws InvalidGlobalNoiseWordsError When `words` is not an array of
 *   non-empty, trimmed strings.
 */
export async function writeGlobalNoiseWords(
  words: unknown,
  tenantRoot?: string,
): Promise<string[]> {
  const normalized = normalizeWordList(words);
  const root = tenantRoot ?? resolveProjectsDir();
  const target = globalNoiseWordsPath(root);
  return withMetaLock(root, async () => {
    await atomicWriteFile(target, JSON.stringify(normalized, null, 2), {
      writeOptions: "utf8",
      durable: process.env.GETWRITE_DURABLE_META === "1",
    });
    return normalized;
  });
}
