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
