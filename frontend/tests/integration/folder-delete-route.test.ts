/**
 * Integration tests for POST /api/folder/[folder-id]/delete (Feature 26
 * trash-ui, FR-3, Task 13).
 *
 * Exercises the actual route `POST` handler against a `projectId`-scoped
 * `GETWRITE_PROJECTS_DIR`, per the pattern established in
 * `tests/unit/resource-delete-route.test.ts`.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateUUID } from "../../src/lib/models/uuid";
import {
  createFolderResource,
  createTextResource,
  writeResourceToFile,
} from "../../src/lib/models/resource";
import { removeDirRetry } from "../unit/helpers/fs-utils";
import * as resourceCrudCore from "../../src/lib/models/resource-crud-core";

const tmpDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
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
    path.join(os.tmpdir(), "gw-folder-delete-route-"),
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

function deleteRequest(folderId: string, body: unknown): Request {
  return new Request(`http://localhost/api/folder/${folderId}/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

describe("POST /api/folder/[folder-id]/delete (projectId-based)", () => {
  it("moves a folder with nested resources into .trash/ as a whole subtree", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const top = createFolderResource({ name: "Top Folder" });
      await writeResourceToFile(projectPath, top);

      const child = createFolderResource({
        name: "Child Folder",
        parentFolderId: top.id,
      });
      await writeResourceToFile(projectPath, child);

      const childResource = createTextResource({
        name: "Nested Resource",
        folderId: child.id,
        plainText: "content",
      });
      await writeResourceToFile(projectPath, childResource);

      const { POST } =
        await import("../../app/api/folder/[folder-id]/delete/route");
      const res = await POST(deleteRequest(top.id, { projectId }) as never, {
        params: Promise.resolve({ "folder-id": top.id }),
      });

      expect(res.status).toBe(200);

      // The top folder and its nested folder/resource are all gone from the
      // live project tree, not just the top folder's own descriptor.
      expect(
        await pathExists(path.join(projectPath, "folders", top.slug)),
      ).toBe(false);
      expect(
        await pathExists(path.join(projectPath, "folders", child.slug)),
      ).toBe(false);
      expect(
        await pathExists(path.join(projectPath, "resources", childResource.id)),
      ).toBe(false);

      // The whole subtree landed in .trash/, per Task 6's softDeleteFolder.
      expect(
        await pathExists(path.join(projectPath, ".trash", "folders", top.slug)),
      ).toBe(true);
      expect(
        await pathExists(
          path.join(projectPath, ".trash", "folders", child.slug),
        ),
      ).toBe(true);
      expect(
        await pathExists(
          path.join(
            projectPath,
            ".trash",
            "meta",
            `resource-${childResource.id}.meta.json`,
          ),
        ),
      ).toBe(true);
    });
  });

  it("returns the uniform 400 when projectId is not a well-formed UUID", async () => {
    const { projectsDir } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const folderId = generateUUID();
      const { POST } =
        await import("../../app/api/folder/[folder-id]/delete/route");
      const res = await POST(
        deleteRequest(folderId, { projectId: "not-a-uuid" }) as never,
        { params: Promise.resolve({ "folder-id": folderId }) },
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid projectId");
    });
  });

  it("returns 404 when the folder does not exist", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const folderId = generateUUID();
      const { POST } =
        await import("../../app/api/folder/[folder-id]/delete/route");
      const res = await POST(deleteRequest(folderId, { projectId }) as never, {
        params: Promise.resolve({ "folder-id": folderId }),
      });

      expect(res.status).toBe(404);
    });
  });

  it("calls softDeleteFolderCore rather than softDeleteFolder directly (Trash UI follow-ups, Task 3)", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const folderId = generateUUID();
      const spy = vi
        .spyOn(resourceCrudCore, "softDeleteFolderCore")
        .mockResolvedValue(undefined);

      const { POST } =
        await import("../../app/api/folder/[folder-id]/delete/route");
      const res = await POST(deleteRequest(folderId, { projectId }) as never, {
        params: Promise.resolve({ "folder-id": folderId }),
      });

      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(projectId, folderId);
    });
  });
});
