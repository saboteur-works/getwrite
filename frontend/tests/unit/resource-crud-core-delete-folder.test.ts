/**
 * Unit tests for `resource-crud-core.ts`'s `softDeleteFolderCore` (Trash UI
 * follow-ups, FR-3, Task 3).
 *
 * Per resolved OQ-1, `softDeleteFolderCore` is a thin wrap —
 * `resolveResourceProjectRootOrThrow` plus one call into the existing
 * `softDeleteFolder(projectRoot, folderId)` model function (`trash.ts`,
 * unchanged) — mirroring `renameFolderCore`'s own shape. These tests exercise
 * the core directly (no HTTP route, no native transport) against a real
 * temp-dir project, matching `folder-delete-route.test.ts`'s fixture
 * conventions.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateUUID } from "../../src/lib/models/uuid";
import {
  createFolderResource,
  createTextResource,
  writeResourceToFile,
} from "../../src/lib/models/resource";
import {
  InvalidProjectIdCoreError,
  softDeleteFolderCore,
} from "../../src/lib/models/resource-crud-core";
import { removeDirRetry } from "./helpers/fs-utils";

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

async function makeTmpProjectsDir(): Promise<{
  projectsDir: string;
  projectId: string;
  projectPath: string;
}> {
  const projectsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-resource-crud-core-delete-folder-"),
  );
  tmpDirs.push(projectsDir);
  const projectId = generateUUID();
  const projectPath = path.join(projectsDir, projectId);
  await fs.mkdir(projectPath, { recursive: true });
  return { projectsDir, projectId, projectPath };
}

async function withProjectsDirEnv<T>(
  projectsDir: string,
  fn: () => Promise<T>,
): Promise<T> {
  const originalEnv = process.env.GETWRITE_PROJECTS_DIR;
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  try {
    return await fn();
  } finally {
    process.env.GETWRITE_PROJECTS_DIR = originalEnv;
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

describe("softDeleteFolderCore", () => {
  it("moves a folder and its nested resource into .trash/, matching softDeleteFolder's documented behavior", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const folder = createFolderResource({ name: "Chapter One" });
      await writeResourceToFile(projectPath, folder);

      const nested = createTextResource({
        name: "Scene One",
        folderId: folder.id,
        plainText: "content",
      });
      await writeResourceToFile(projectPath, nested);

      await softDeleteFolderCore(projectId, folder.id);

      // Removed from the live project tree.
      expect(
        await pathExists(path.join(projectPath, "folders", folder.slug)),
      ).toBe(false);
      expect(
        await pathExists(path.join(projectPath, "resources", nested.id)),
      ).toBe(false);

      // Landed in .trash/.
      expect(
        await pathExists(
          path.join(projectPath, ".trash", "folders", folder.slug),
        ),
      ).toBe(true);
      expect(
        await pathExists(
          path.join(
            projectPath,
            ".trash",
            "meta",
            `resource-${nested.id}.meta.json`,
          ),
        ),
      ).toBe(true);
    });
  });

  it("throws InvalidProjectIdCoreError for a malformed projectId, before touching the filesystem", async () => {
    await expect(
      softDeleteFolderCore("not-a-uuid", generateUUID()),
    ).rejects.toBeInstanceOf(InvalidProjectIdCoreError);
  });

  it("propagates softDeleteFolder's rejection when the folder does not exist", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      await expect(
        softDeleteFolderCore(projectId, generateUUID()),
      ).rejects.toThrow();
    });
  });
});
