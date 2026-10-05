// Last Updated: 2026-10-05

/**
 * @module native-global-noise-words
 *
 * **Entity Mention Noise Flagging, Task 10 (FR-5c).** The native Android
 * runtime's cross-project "global" custom noise-word list store: a single,
 * device-level, app-private, **unencrypted** JSON file holding a plain array
 * of strings, read and written directly against the Capacitor Filesystem
 * plugin — never through `io.ts`'s `StorageAdapter`, `storage-context.ts`,
 * or `capacitorFsAdapter.ts`.
 *
 * **Why outside any `<tenantRoot>/<projectId>/` path, and why unencrypted.**
 * ADR-022's encryption scheme (`crypto/adapter-selection.ts`,
 * `crypto/workspace-adapter.ts`) resolves a project id out of the storage
 * path to decide whether to wrap a plain adapter in `encryptingAdapter.ts`;
 * a file with no project id in its path is never a candidate for that
 * wrapping in the first place. This module goes further than relying on
 * that pass-through, though: it never calls into `io.ts`/`storage-context.ts`
 * at all, so there is no `StorageContext`, no `tenantRoot`, and no adapter
 * resolution for it to pass through — it talks to the
 * {@link CapacitorFilesystemLike} plugin surface directly. That is a
 * deliberate, simpler choice than routing through `capacitorFsAdapter.ts`
 * (a {@link StorageAdapter} shim built for project-rooted reads/writes,
 * whose `StorageAdapter` contract this single-file, project-independent
 * store does not need) — see this module's own unit tests for the
 * plain-JSON-on-disk proof this posture is meant to guarantee.
 *
 * `native-bootstrap.ts`'s `PROJECTS_SUBPATH` resolves `/projects` as the
 * on-device tenant root, itself relative to `Directory.Data` (the plugin's
 * app-private storage root). This module resolves a **sibling** path at
 * that same `Directory.Data` root — `/global-noise-words.json` — which is
 * why it is read via the raw plugin rather than any project-scoped seam:
 * nothing here is ever nested inside `/projects`.
 *
 * Mirrors the shape of `global-noise-words.ts` (web/hosted, FR-5a) and
 * Electron's `userData/workspace.json` extension (FR-5b): a plain JSON array
 * of strings, with no sync between the three runtime-specific stores
 * (FR-15).
 *
 * **Native-only.** Like `capacitor-filesystem-real.ts` and
 * `native-bootstrap.ts`, this module only ever reaches `@capacitor/filesystem`
 * through a dynamic `import()`, and must never be statically imported from
 * anything reachable by the web/hosted/desktop client bundle.
 */
import {
  FsEncoding,
  type CapacitorFilesystemLike,
} from "./capacitor-filesystem";

/**
 * Device-level path for the global noise-word list, resolved relative to
 * `Directory.Data` — a sibling of `native-bootstrap.ts`'s `/projects` root,
 * never nested inside it and never carrying a project id.
 */
const GLOBAL_NOISE_WORDS_PATH = "/global-noise-words.json";

/**
 * Memoized real plugin handle, mirroring `native-bootstrap.ts`'s own
 * one-time-resolution style for the dynamic `@capacitor/filesystem` import.
 * Cleared only by {@link __resetNativeGlobalNoiseWordsForTests}.
 */
let cachedFs: CapacitorFilesystemLike | null = null;

/** Resolves (and memoizes) the real on-device Capacitor filesystem plugin. */
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

/**
 * Reads the device-level global noise-word list.
 *
 * @returns The persisted list, or `[]` on first run (no file yet) or if the
 *   persisted content is not a JSON array of strings.
 */
export async function getNativeGlobalNoiseWords(): Promise<string[]> {
  const fs = await resolveFs();
  let raw: string;
  try {
    const { data } = await fs.readFile({
      path: GLOBAL_NOISE_WORDS_PATH,
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
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry): entry is string => typeof entry === "string");
}

/**
 * Overwrites the device-level global noise-word list with `words`, as a
 * plain, unencrypted JSON array.
 */
export async function setNativeGlobalNoiseWords(
  words: string[],
): Promise<void> {
  const fs = await resolveFs();
  await fs.writeFile({
    path: GLOBAL_NOISE_WORDS_PATH,
    data: JSON.stringify(words),
    encoding: FsEncoding.UTF8,
  });
}

/**
 * Test-only reset of the memoized plugin handle, so unit tests can swap in a
 * fresh fake (via mocking `capacitor-filesystem-real.ts`) between runs
 * without cross-test leakage.
 */
export function __resetNativeGlobalNoiseWordsForTests(): void {
  cachedFs = null;
}
