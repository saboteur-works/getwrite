import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { softDeleteFolder, restoreFolder } from "../../src/lib/models/trash";
import { readSidecar } from "../../src/lib/models/sidecar";
import { writeResourceToFile } from "../../src/lib/models/resource-persistence";
import {
  createTextResource,
  createFolderResource,
} from "../../src/lib/models/resource-factory";
import { readFolderTree } from "../../src/lib/models/folder-utils";
import { removeDirRetry } from "../unit/helpers/fs-utils";

async function makeProjectRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "gw-trash-folder-restore-"));
}

interface RawFolder {
  id: string;
  name: string;
  parentId: string | null;
  orderIndex: number;
}

async function readAllFolders(projectRoot: string): Promise<RawFolder[]> {
  const raw = await readFolderTree(path.join(projectRoot, "folders"));
  return raw as RawFolder[];
}

async function findFolder(
  projectRoot: string,
  folderId: string,
): Promise<RawFolder | undefined> {
  const all = await readAllFolders(projectRoot);
  return all.find((f) => f.id === folderId);
}

describe("restoreFolder (Task 9, FR-5/FR-20)", () => {
  it("restores a three-level folder tree with every descendant folder/resource back at its original parentId/orderIndex", async () => {
    const projectRoot = await makeProjectRoot();
    try {
      const top = createFolderResource({ name: "Top", orderIndex: 0 });
      await writeResourceToFile(projectRoot, top);

      const child = createFolderResource({
        name: "Child",
        parentFolderId: top.id,
        orderIndex: 1,
      });
      await writeResourceToFile(projectRoot, child);

      const grandchild = createFolderResource({
        name: "Grandchild",
        parentFolderId: child.id,
        orderIndex: 2,
      });
      await writeResourceToFile(projectRoot, grandchild);

      const resourceTop = createTextResource({
        name: "Resource Top",
        folderId: top.id,
        plainText: "top",
        orderIndex: 3,
      });
      await writeResourceToFile(projectRoot, resourceTop);

      const resourceChild = createTextResource({
        name: "Resource Child",
        folderId: child.id,
        plainText: "child",
        orderIndex: 4,
      });
      await writeResourceToFile(projectRoot, resourceChild);

      const resourceGrandchild = createTextResource({
        name: "Resource Grandchild",
        folderId: grandchild.id,
        plainText: "grandchild",
        orderIndex: 5,
      });
      await writeResourceToFile(projectRoot, resourceGrandchild);

      await softDeleteFolder(projectRoot, top.id);

      const result = await restoreFolder(projectRoot, top.id);

      expect(result.relocated).toBe(false);
      expect(result.renamed).toBe(false);
      expect(result.restoredName).toBe("Top");
      expect(result.restoredDescendantFolderIds.sort()).toEqual(
        [child.id, grandchild.id].sort(),
      );
      expect(result.restoredDescendantResourceIds.sort()).toEqual(
        [resourceTop.id, resourceChild.id, resourceGrandchild.id].sort(),
      );

      const restoredTop = await findFolder(projectRoot, top.id);
      expect(restoredTop).toBeDefined();
      expect(restoredTop?.parentId ?? null).toBeNull();
      expect(restoredTop?.orderIndex).toBe(0);

      const restoredChild = await findFolder(projectRoot, child.id);
      expect(restoredChild?.parentId).toBe(top.id);
      expect(restoredChild?.orderIndex).toBe(1);

      const restoredGrandchild = await findFolder(projectRoot, grandchild.id);
      expect(restoredGrandchild?.parentId).toBe(child.id);
      expect(restoredGrandchild?.orderIndex).toBe(2);

      const sidecarTop = await readSidecar(projectRoot, resourceTop.id);
      expect(sidecarTop?.["folderId"]).toBe(top.id);
      expect(sidecarTop?.["orderIndex"]).toBe(3);

      const sidecarChild = await readSidecar(projectRoot, resourceChild.id);
      expect(sidecarChild?.["folderId"]).toBe(child.id);
      expect(sidecarChild?.["orderIndex"]).toBe(4);

      const sidecarGrandchild = await readSidecar(
        projectRoot,
        resourceGrandchild.id,
      );
      expect(sidecarGrandchild?.["folderId"]).toBe(grandchild.id);
      expect(sidecarGrandchild?.["orderIndex"]).toBe(5);
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("falls back to the project root when the top-level folder's original parent no longer exists", async () => {
    const projectRoot = await makeProjectRoot();
    try {
      const outer = createFolderResource({ name: "Outer" });
      await writeResourceToFile(projectRoot, outer);

      const inner = createFolderResource({
        name: "Inner",
        parentFolderId: outer.id,
      });
      await writeResourceToFile(projectRoot, inner);

      await softDeleteFolder(projectRoot, inner.id);

      // Remove the outer folder directly, simulating it no longer existing
      // at restore time (it was itself deleted or otherwise removed).
      await fs.rm(path.join(projectRoot, "folders", outer.slug), {
        recursive: true,
        force: true,
      });

      const result = await restoreFolder(projectRoot, inner.id);

      expect(result.relocated).toBe(true);
      const restoredInner = await findFolder(projectRoot, inner.id);
      expect(restoredInner?.parentId ?? null).toBeNull();
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("applies the resolved OQ-2 suffix rule to the top-level folder's own name on a collision", async () => {
    const projectRoot = await makeProjectRoot();
    try {
      const kept = createFolderResource({ name: "Chapter" });
      await writeResourceToFile(projectRoot, kept);

      const trashed = createFolderResource({ name: "Chapter" });
      await writeResourceToFile(projectRoot, trashed);

      await softDeleteFolder(projectRoot, trashed.id);

      const result = await restoreFolder(projectRoot, trashed.id);

      expect(result.renamed).toBe(true);
      expect(result.restoredName).toBe("Chapter (restored)");

      const restored = await findFolder(projectRoot, trashed.id);
      expect(restored?.name).toBe("Chapter (restored)");
    } finally {
      await removeDirRetry(projectRoot);
    }
  });
});
