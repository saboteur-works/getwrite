// Last Updated: 2026-08-03

/**
 * @module crypto/adapter-selection
 *
 * Decides which storage adapter a given project runs against, and runs work
 * inside the resulting context. This is where the marker, the keyring, and the
 * encrypting decorator finally meet.
 *
 * ```
 *   project has no marker  ──▶ the base adapter, unchanged (identity)
 *   project has a marker   ──▶ encryptingAdapter(base, keyring.projectKey(id))
 * ```
 *
 * **The identity case is the requirement, not an optimisation.** FR3 and FR12
 * say an unencrypted project must be byte-for-byte unchanged on disk and must
 * not run through crypto code at all. Returning the base adapter *itself* — not
 * a pass-through wrapper — is what makes that assertable rather than asserted:
 * a test can compare by reference.
 *
 * **Why this lives outside `storage-context.ts`.** A `StorageContext` binds one
 * adapter per `tenantRoot`, but encryption is per *project*, and a workspace
 * freely mixes encrypted and plain projects. Rather than widen that seam,
 * project-scoped entry points resolve their own adapter here and bind a context
 * around it. Operations that legitimately span projects — `listProjectsCore` —
 * must not use this; they read the plaintext marker and the sealed name index
 * instead (Task 9).
 *
 * **Failure is loud and inert.** If a project is marked encrypted but no key is
 * available, this raises and touches nothing. Falling back to the base adapter
 * would hand ciphertext to code that would treat it as content and could
 * overwrite it; FR26 requires the files be left exactly as they are so a later
 * recovery path still has something to work with.
 */
import path from "node:path";
import { runInStorageContext } from "../storage-context";
import { encryptingAdapter } from "../encryptingAdapter";
import type { StorageAdapter } from "../io";
import { getPlainStorageAdapter } from "../io";
import { readProjectMarker } from "./project-marker";
import { readConversionMarker } from "./convert-project";
import { UnknownProjectError, type Keyring } from "./keyring";
import { ProjectLockedError, MissingProjectKeyError } from "./locked-errors";

export { ProjectLockedError, MissingProjectKeyError };

/**
 * Resolves the adapter a project's I/O must run through.
 *
 * @param projectRoot - The project directory.
 * @param baseAdapter - The deployment's underlying adapter (filesystem, object
 *   store, or Capacitor bridge).
 * @param keyring - The unlocked keyring, or `null` when the workspace is locked.
 * @returns `baseAdapter` itself for an unencrypted project; an encrypting
 *   decorator over it for an encrypted one.
 * @throws {ProjectLockedError} When the project is encrypted and no unlocked
 *   keyring is available.
 * @throws {MissingProjectKeyError} When the keyring is unlocked but holds no key
 *   for this project.
 * @throws {ProjectMarkerFormatError} When the project's marker is unreadable.
 */
export async function resolveProjectAdapter(
  projectRoot: string,
  baseAdapter: StorageAdapter,
  keyring: Keyring | null,
): Promise<StorageAdapter> {
  // An in-flight conversion is decisive on its own. Mid-*encrypt* the project
  // marker does not exist yet, so consulting it alone would hand a half-sealed
  // project to the base adapter and read ciphertext as content.
  const converting = await readConversionMarker(projectRoot, baseAdapter);
  const marker = await readProjectMarker(projectRoot, baseAdapter);

  // The identity return: an unencrypted project never meets crypto code, and a
  // locked workspace does not stop the user working on it (FR20's decline path).
  if (converting === null && marker === null) return baseAdapter;

  const projectId = path.basename(projectRoot);
  if (!keyring || keyring.isLocked()) throw new ProjectLockedError(projectId);

  try {
    return encryptingAdapter(baseAdapter, keyring.projectKey(projectId), {
      // Tolerance lasts exactly as long as the conversion marker does (FR22).
      tolerant: converting !== null,
    });
  } catch (error) {
    if (error instanceof UnknownProjectError) {
      throw new MissingProjectKeyError(projectId);
    }
    throw error;
  }
}

/**
 * Runs `fn` inside a storage context scoped to one project, with the adapter
 * that project requires.
 *
 * `tenantRoot` is bound to the project's *parent* directory, matching what
 * `resolveProjectsDir()` is contracted to return inside a request — the same
 * convention `runForTenant` follows.
 *
 * @param projectRoot - The project directory.
 * @param keyring - The unlocked keyring, or `null` when locked.
 * @param fn - Work to run inside the context.
 * @param baseAdapter - The deployment's underlying adapter; defaults to the
 *   currently active one.
 * @returns Whatever `fn` returns.
 * @throws Whatever {@link resolveProjectAdapter} raises, before `fn` runs.
 */
export async function runInProjectContext<T>(
  projectRoot: string,
  keyring: Keyring | null,
  fn: () => T | Promise<T>,
  baseAdapter: StorageAdapter = getPlainStorageAdapter(),
): Promise<T> {
  const adapter = await resolveProjectAdapter(
    projectRoot,
    baseAdapter,
    keyring,
  );
  // `projectRoot` is what lets `io.ts`'s mutating wrappers enforce a write
  // barrier held on this project (see `write-barrier.ts`).
  return runInStorageContext(
    { tenantRoot: path.dirname(projectRoot), adapter, projectRoot },
    fn,
  );
}
