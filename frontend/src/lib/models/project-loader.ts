import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import type { Project } from "./types";
import { readSidecar } from "./sidecar";
import { readFolderTree } from "./folder-utils";
import { migrateProjectOnLoad } from "./metadata-schema";

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
 *   `resources/<id>/content.txt` (gracefully handles a missing `meta/`
 *   directory by returning an empty resources array).
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
  const metadataDir = path.join(projectPath, "meta");
  const resourcesDir = path.join(projectPath, "resources");

  const folders = await readFolderTree(foldersDir);

  let metadataEntries: string[];
  try {
    metadataEntries = await fs.readdir(metadataDir);
  } catch {
    metadataEntries = [];
  }

  const resourcePromises = metadataEntries
    .filter(
      (name) => name.startsWith("resource-") && name.endsWith(".meta.json"),
    )
    .map(async (metadataName) => {
      const sidecar = await readSidecar(
        projectPath,
        metadataName.replace("resource-", "").replace(".meta.json", ""),
      );
      const sidecarId =
        sidecar && typeof sidecar.id === "string" ? sidecar.id : "";
      const type =
        sidecar && typeof sidecar.type === "string" ? sidecar.type : "";
      // Only text resources persist a content.txt. Image/audio resources store
      // a binary original.<ext> with no content.txt, so reading it would throw.
      const resourcePlaintext =
        type === "text"
          ? fsSync.readFileSync(
              path.join(resourcesDir, sidecarId, "content.txt"),
              { encoding: "utf-8" },
            )
          : "";
      const wordCount =
        type === "text"
          ? resourcePlaintext.trim() === ""
            ? 0
            : resourcePlaintext.trim().split(/\s+/).length
          : undefined;
      return {
        ...sidecar,
        plaintext: resourcePlaintext,
        ...(wordCount !== undefined && { wordCount }),
      } as LoadedResource;
    });

  const resources = await Promise.all(resourcePromises);

  return { project, folders, resources };
}
