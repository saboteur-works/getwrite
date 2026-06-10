import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createFolderResource,
  createTextResource,
  writeResourceToFile,
} from "../../src/lib/models/resource";
import {
  readFolderTree,
  renameFolderById,
} from "../../src/lib/models/folder-utils";
import {
  buildResourceTree,
  ROOT_ITEM_ID,
} from "../../components/ResourceTree/buildResourceTree";
import type { AnyResource, Folder } from "../../src/lib/models";
import { removeDirRetry } from "./helpers/fs-utils";

/**
 * Regression coverage for the data-loss observed in the "The SF Sideshow"
 * project: a folder's `folder.json` was silently overwritten when a second,
 * unrelated folder was created with the same slug, detaching the first folder's
 * children to the tree root.
 *
 * Root cause: `writeResourceToFile` persisted a folder to
 * `folders/<slug>/folder.json` keyed solely on the slug, with no collision
 * check. `resolveFolderDir` (resource-persistence.ts) now diverts a colliding
 * folder to a suffixed directory so both descriptors survive.
 */
describe("folder slug collision no longer overwrites an existing descriptor", () => {
  it("a second folder with a colliding slug is written to a separate directory", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-folder-slug-collision-"),
    );

    try {
      // First folder — e.g. the original "Episode 1" under Season 1.
      const first = createFolderResource({ name: "Episode 1" });
      await writeResourceToFile(projectRoot, first);

      const child = createTextResource({
        name: "Episode 1 - Scene 1",
        folderId: first.id,
        plainText: "It was New Year's Eve.",
      });
      await writeResourceToFile(projectRoot, child);

      expect(first.slug).toBe("episode-1");

      // Second, unrelated folder created later — e.g. "Episode 1" under a new
      // Season 2. Different id, identical slug.
      const second = createFolderResource({ name: "Episode 1" });
      expect(second.slug).toBe(first.slug);
      expect(second.id).not.toBe(first.id);
      await writeResourceToFile(projectRoot, second);

      // Both descriptors must survive — the collision is diverted to a
      // suffixed directory rather than overwriting the first folder.json.
      const folders = (await readFolderTree(
        path.join(projectRoot, "folders"),
      )) as Folder[];

      const ids = folders.map((f) => f.id);
      expect(ids).toContain(first.id);
      expect(ids).toContain(second.id);
      expect(folders).toHaveLength(2);
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("re-saving the same folder reuses its directory rather than spawning a duplicate", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-folder-slug-resave-"),
    );

    try {
      const folder = createFolderResource({ name: "Episode 1" });
      await writeResourceToFile(projectRoot, folder);
      // Idempotent re-save (same id, same slug) must not create a second dir.
      await writeResourceToFile(projectRoot, { ...folder, orderIndex: 5 });

      const folders = (await readFolderTree(
        path.join(projectRoot, "folders"),
      )) as Folder[];

      expect(folders).toHaveLength(1);
      expect(folders[0].id).toBe(folder.id);
      expect(folders[0].orderIndex).toBe(5);
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("rename-in-place then same-name folder: original folder and its children are preserved (the SF Sideshow scenario)", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-folder-slug-rename-"),
    );

    try {
      // Original folder created as "Episode 1" (slug episode-1).
      const original = createFolderResource({ name: "Episode 1" });
      await writeResourceToFile(projectRoot, original);

      const scene = createTextResource({
        name: "Episode 1 - Scene 1",
        folderId: original.id,
        plainText: "It was New Year's Eve, 2012.",
      });
      await writeResourceToFile(projectRoot, scene);

      // User renames it to "Episode 1: New Years Eve". renameFolderById edits
      // folder.json in place: the slug and directory (folders/episode-1/) are
      // deliberately preserved.
      const renamed = await renameFolderById(
        path.join(projectRoot, "folders"),
        original.id,
        "Episode 1: New Years Eve",
      );
      expect(renamed?.["name"]).toBe("Episode 1: New Years Eve");
      expect(renamed?.["slug"]).toBe("episode-1");

      // Later, a brand-new "Episode 1" is created (e.g. under Season 2). It
      // slugifies back to "episode-1" but must not clobber the renamed folder.
      const newEpisode = createFolderResource({ name: "Episode 1" });
      await writeResourceToFile(projectRoot, newEpisode);

      const folders = (await readFolderTree(
        path.join(projectRoot, "folders"),
      )) as AnyResource[];
      const resources: AnyResource[] = [...folders, scene as AnyResource];

      const tree = buildResourceTree(resources);

      // The renamed "Episode 1: New Years Eve" descriptor still exists...
      expect(tree[original.id]).toBeDefined();
      expect(tree[original.id].name).toBe("Episode 1: New Years Eve");
      expect(tree[newEpisode.id]).toBeDefined();

      // ...and its scene stays attached to it, not stranded at the root.
      expect(tree[scene.id].parentId).toBe(original.id);
      expect(tree[original.id].children).toContain(scene.id);
      expect(tree[ROOT_ITEM_ID].children).not.toContain(scene.id);
    } finally {
      await removeDirRetry(projectRoot);
    }
  });
});
