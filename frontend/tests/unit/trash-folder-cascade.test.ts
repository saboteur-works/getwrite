import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createFolderResource,
  createTextResource,
  writeResourceToFile,
} from "../../src/lib/models/resource";
import { softDeleteFolder } from "../../src/lib/models/trash";
import { readSidecar } from "../../src/lib/models/sidecar";
import { removeDirRetry } from "./helpers/fs-utils";
import type { TrashFolderManifest } from "../../src/lib/models/schemas";

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

describe("models/trash — softDeleteFolder cascade (Task 6, FR-3, FR-20)", () => {
  it("cascades a three-level-deep folder tree with resources at each level into .trash/", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-trash-folder-cascade-"),
    );
    try {
      // Three-level folder tree: top -> mid -> leaf, each with a resource.
      const top = createFolderResource({ name: "Top Folder" });
      await writeResourceToFile(tmp, top);

      const topResource = createTextResource({
        name: "Top Resource",
        folderId: top.id,
        plainText: "Top level content.",
      });
      await writeResourceToFile(tmp, topResource);

      const mid = createFolderResource({
        name: "Mid Folder",
        parentFolderId: top.id,
      });
      await writeResourceToFile(tmp, mid);

      const midResource = createTextResource({
        name: "Mid Resource",
        folderId: mid.id,
        plainText: "Mid level content.",
      });
      await writeResourceToFile(tmp, midResource);

      const leaf = createFolderResource({
        name: "Leaf Folder",
        parentFolderId: mid.id,
      });
      await writeResourceToFile(tmp, leaf);

      const leafResource = createTextResource({
        name: "Leaf Resource",
        folderId: leaf.id,
        plainText: "Leaf level content.",
      });
      await writeResourceToFile(tmp, leafResource);

      // A sibling folder/resource outside the deleted subtree must survive.
      const sibling = createFolderResource({ name: "Sibling Folder" });
      await writeResourceToFile(tmp, sibling);
      const siblingResource = createTextResource({
        name: "Sibling Resource",
        folderId: sibling.id,
        plainText: "Untouched.",
      });
      await writeResourceToFile(tmp, siblingResource);

      await softDeleteFolder(tmp, top.id);

      // Manifest lists every descendant with its original parentId/orderIndex.
      const manifestPath = path.join(
        tmp,
        ".trash",
        "meta",
        `folder-${top.id}.json`,
      );
      expect(await pathExists(manifestPath)).toBe(true);
      const manifest = JSON.parse(
        await fs.readFile(manifestPath, "utf8"),
      ) as TrashFolderManifest;

      expect(manifest.folder.id).toBe(top.id);

      const byId = new Map(manifest.descendants.map((e) => [e.id, e]));
      expect(byId.get(topResource.id)).toEqual({
        id: topResource.id,
        kind: "resource",
        parentId: top.id,
        orderIndex: topResource.orderIndex,
      });
      expect(byId.get(mid.id)).toEqual({
        id: mid.id,
        kind: "folder",
        parentId: top.id,
        orderIndex: mid.orderIndex,
      });
      expect(byId.get(midResource.id)).toEqual({
        id: midResource.id,
        kind: "resource",
        parentId: mid.id,
        orderIndex: midResource.orderIndex,
      });
      expect(byId.get(leaf.id)).toEqual({
        id: leaf.id,
        kind: "folder",
        parentId: mid.id,
        orderIndex: leaf.orderIndex,
      });
      expect(byId.get(leafResource.id)).toEqual({
        id: leafResource.id,
        kind: "resource",
        parentId: leaf.id,
        orderIndex: leafResource.orderIndex,
      });
      expect(manifest.descendants).toHaveLength(5);

      // Every descendant resource: sidecar gone from the live project, and
      // moved (as content + sidecar) into .trash/.
      for (const res of [topResource, midResource, leafResource]) {
        expect(await readSidecar(tmp, res.id)).toBeNull();

        const trashedSidecar = path.join(
          tmp,
          ".trash",
          "meta",
          `resource-${res.id}.meta.json`,
        );
        expect(await pathExists(trashedSidecar)).toBe(true);

        const trashedContentDir = path.join(
          tmp,
          ".trash",
          "resources",
          `${res.id}-${res.id}`,
        );
        expect(await pathExists(trashedContentDir)).toBe(true);

        // Ref record persisted alongside the moved resource.
        const refRecordPath = path.join(
          tmp,
          ".trash",
          "meta",
          `refs-${res.id}.json`,
        );
        expect(await pathExists(refRecordPath)).toBe(true);

        // Nothing remains under the original resources/ path.
        const originalContentDir = path.join(tmp, "resources", res.id);
        expect(await pathExists(originalContentDir)).toBe(false);
      }

      // Every descendant folder's own folder.json moved into .trash/folders/.
      for (const folder of [top, mid, leaf]) {
        const trashedFolderJson = path.join(
          tmp,
          ".trash",
          "folders",
          folder.slug,
          "folder.json",
        );
        expect(await pathExists(trashedFolderJson)).toBe(true);

        const originalFolderDir = path.join(tmp, "folders", folder.slug);
        expect(await pathExists(originalFolderDir)).toBe(false);
      }

      // The untouched sibling subtree is unaffected.
      expect(await readSidecar(tmp, siblingResource.id)).not.toBeNull();
      const siblingFolderDir = path.join(tmp, "folders", sibling.slug);
      expect(await pathExists(siblingFolderDir)).toBe(true);
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("produces a valid empty-descendants manifest and moves only the folder's own descriptor when it has zero descendants", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-trash-folder-cascade-empty-"),
    );
    try {
      const lonely = createFolderResource({ name: "Lonely Folder" });
      await writeResourceToFile(tmp, lonely);

      await softDeleteFolder(tmp, lonely.id);

      const manifestPath = path.join(
        tmp,
        ".trash",
        "meta",
        `folder-${lonely.id}.json`,
      );
      expect(await pathExists(manifestPath)).toBe(true);
      const manifest = JSON.parse(
        await fs.readFile(manifestPath, "utf8"),
      ) as TrashFolderManifest;

      expect(manifest.folder.id).toBe(lonely.id);
      expect(manifest.descendants).toEqual([]);

      const trashedFolderJson = path.join(
        tmp,
        ".trash",
        "folders",
        lonely.slug,
        "folder.json",
      );
      expect(await pathExists(trashedFolderJson)).toBe(true);

      const originalFolderDir = path.join(tmp, "folders", lonely.slug);
      expect(await pathExists(originalFolderDir)).toBe(false);
    } finally {
      await removeDirRetry(tmp);
    }
  });
});
