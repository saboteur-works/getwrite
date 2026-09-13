/**
 * @module scrivener-import/destination
 *
 * Where a Scrivener import lands, and what it is called by default.
 *
 * Main-process-only, pure logic: no filesystem writes, no Electron APIs.
 * `computeDestinationProjectRoot` picks a fresh UUID-named directory under a
 * given projects directory the same way the frontend derives a project's
 * on-disk root from its id (`frontend/src/lib/models/project-path.ts`:
 * `path.join(projectsDir, projectId)`), but the id itself is minted here,
 * since a UI-driven import has no existing project to validate an id
 * against. `resolveProjectsDir` (`electron/src/projects-dir.ts`) is reused
 * to find the projects directory itself; this module only adds the
 * UUID-directory and name-stripping logic on top of it.
 */
import crypto from "crypto";
import path from "path";
import type { SelectionHandleRegistry } from "./selection-handles";

/** A freshly computed, not-yet-created destination for an import. */
export interface DestinationProjectRoot {
  /** The newly minted project id (a UUID). */
  projectId: string;
  /** `path.join(projectsDir, projectId)` — not yet created on disk. */
  projectRoot: string;
}

/**
 * Computes a fresh, UUID-named destination project root.
 *
 * Mirrors the convention `frontend/src/lib/models/project-path.ts` validates
 * on read: a project's directory name is its id, and its id is a UUID. Here
 * there is no existing id to validate, so one is minted with Node's built-in
 * `crypto.randomUUID()` — no new dependency needed for this.
 *
 * Does not touch the filesystem: the caller is responsible for refusing an
 * unexpected collision and creating the directory.
 *
 * @param projectsDir - The projects directory to place the new project under
 *   (typically `resolveProjectsDir()`'s result).
 * @returns The minted project id and its corresponding project root path.
 */
export function computeDestinationProjectRoot(
  projectsDir: string,
): DestinationProjectRoot {
  const projectId = crypto.randomUUID();
  return { projectId, projectRoot: path.join(projectsDir, projectId) };
}

/** Matches a trailing `.scriv` extension, case-insensitively. */
const SCRIV_EXTENSION = /\.scriv$/i;

/**
 * Derives the default project name from a picked `.scriv` folder's basename.
 *
 * Mirrors `importScrivenerProject`'s own default-naming behavior
 * (`frontend/src/lib/models/scrivener/import-scrivener-project.ts`): strip a
 * trailing `.scriv` extension, case-insensitively, and leave the basename
 * unchanged when there is no such extension to strip.
 *
 * @param basename - The picked `.scriv` folder's basename (not a full path).
 * @returns The default project name.
 */
export function deriveDefaultProjectName(basename: string): string {
  return basename.replace(SCRIV_EXTENSION, "");
}

/** Result of picking a `.scriv` source, safe to hand to a renderer. */
export interface ScrivenerSelectionResult {
  ok: true;
  /** Opaque handle standing in for the picked path (see `selection-handles.ts`). */
  handle: string;
  /** The picked folder's basename, with any `.scriv` extension stripped
   * (FR-16): what the import dialog's name field is prefilled with. */
  displayName: string;
}

/**
 * Builds the result returned to the renderer for a picked `.scriv` source,
 * recording it in the selection-handle registry along the way.
 *
 * Pure aside from the registry mutation: no filesystem access, no Electron
 * APIs. Never includes `scrivPath` itself in the returned object — only the
 * opaque handle and the derived display name — matching the existing FR-1/
 * FR-3 no-path-to-renderer constraint the IPC handler otherwise enforces.
 *
 * @param scrivPath - The already-picked absolute path to the `.scriv`
 *   package (never returned to the caller).
 * @param handles - The selection-handle registry to record the pick in.
 * @returns The renderer-safe result: an opaque handle plus the
 *   extension-stripped display name.
 */
export function buildScrivenerSelectionResult(
  scrivPath: string,
  handles: SelectionHandleRegistry,
): ScrivenerSelectionResult {
  const displayName = deriveDefaultProjectName(path.basename(scrivPath));
  const handle = handles.record(scrivPath, displayName);
  return { ok: true, handle, displayName };
}
