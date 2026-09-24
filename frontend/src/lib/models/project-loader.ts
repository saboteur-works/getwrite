import path from "node:path";
import { readFile, readdir } from "./io";
import type { Project } from "./types";
import { readSidecar } from "./sidecar";
import { readFolderTree } from "./folder-utils";
import { migrateProjectOnLoad } from "./metadata-schema";

/**
 * True for the "this path does not exist" error both the real `fs` adapter and
 * `memoryAdapter` raise (`code: "ENOENT"`), and nothing else — a permissions
 * failure, an I/O error, or a locked-project error is not a missing directory.
 */
function isMissingEntryError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/** A resource entry assembled from its sidecar metadata and plaintext content. */
export interface LoadedResource {
  id: string;
  name?: string;
  type?: string;
  createdAt?: string;
  folderId?: string | null;
  slug?: string | null;
  metadata?: Record<string, unknown>;
  plaintext: string;
  wordCount?: number;
}

/** The full project payload loaded from disk. */
export interface LoadedProject {
  project: Project;
  folders: unknown[];
  resources: LoadedResource[];
}

/**
 * Loads a project and all its related entities from the local filesystem.
 *
 * - Reads `project.json` for project metadata.
 * - Reads folder descriptors recursively via `readFolderTree` (gracefully
 *   handles a missing `folders/` directory).
 * - Reads resource sidecars from `meta/` and their plaintext from
 *   `resources/<id>/content.txt`. A MISSING `meta/` directory yields an empty
 *   resources array; an UNREADABLE one throws, rather than presenting a
 *   project whose contents could not be read as a project with no contents.
 *
 * @param projectPath - Absolute path to the project root directory.
 */
export async function loadProjectFromDisk(
  projectPath: string,
): Promise<LoadedProject> {
  // Apply the one-time load migration (unlock built-ins, rename the timeline
  // group, seed feature toggles) and use the returned, migrated project so the
  // store sees the canonical config.
  const project = await migrateProjectOnLoad(projectPath);

  const foldersDir = path.join(projectPath, "folders");
  const metaDir = path.join(projectPath, "meta");
  const resourcesDir = path.join(projectPath, "resources");

  const folders = await readFolderTree(foldersDir);

  let metaFilenames: string[];
  try {
    metaFilenames = (await readdir(metaDir)) as string[];
  } catch (error) {
    // A project with no `meta/` directory at all is an ordinary state — a new
    // or legacy project — and loads with no resources.
    //
    // Every OTHER failure propagates. This catch used to swallow all of them,
    // so an unreadable `meta/` (permissions, I/O error) opened as a project
    // that appeared EMPTY: a writer would see their manuscript gone and the
    // app would report nothing wrong. It also swallowed `ProjectLockedError`
    // and `MissingProjectKeyError` from the encrypting adapter, which is the
    // exact fail-closed violation Feature 54 exists to prevent — a locked
    // project would render as an empty one rather than prompting to unlock.
    if (!isMissingEntryError(error)) throw error;
    metaFilenames = [];
  }

  const resources = await Promise.all(
    metaFilenames
      .filter((f) => f.startsWith("resource-") && f.endsWith(".meta.json"))
      .map(async (filename) => {
        const sidecar = await readSidecar(
          projectPath,
          filename.replace("resource-", "").replace(".meta.json", ""),
        );
        const id = sidecar && typeof sidecar.id === "string" ? sidecar.id : "";
        const type =
          sidecar && typeof sidecar.type === "string" ? sidecar.type : "";
        // Only text resources persist a content.txt. Image/audio resources store
        // a binary original.<ext> with no content.txt, so reading it would throw.
        const plaintext =
          type === "text"
            ? await readFile(
                path.join(resourcesDir, id, "content.txt"),
                "utf-8",
              )
            : "";
        const wordCount =
          type === "text"
            ? plaintext.trim() === ""
              ? 0
              : plaintext.trim().split(/\s+/).length
            : undefined;
        return {
          ...sidecar,
          plaintext,
          ...(wordCount !== undefined && { wordCount }),
        } as LoadedResource;
      }),
  );

  return { project, folders, resources };
}
