import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createFolderResource,
  createTextResource,
  writeResourceToFile,
} from "../../src/lib/models/resource";
import {
  listTrashedItems,
  purgeFolder,
  restoreFolder,
  softDeleteFolder,
} from "../../src/lib/models/trash";
import { purgeBatchCore, purgeOneCore } from "../../src/lib/models/trash-core";
import {
  createProjectFromType,
  type ProjectTypeSpec,
} from "../../src/lib/models/project-creator";
import { readFolderSidecar, readSidecar } from "../../src/lib/models/sidecar";
import { removeDirRetry } from "./helpers/fs-utils";
import {
  makeRefFixture,
  readOtherUserMetadata,
  type SchemaState,
} from "./helpers/f87-reference-delete-fixture";
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

/**
 * Feature 89, FR-8: layouts built by `createProjectFromType`, whose
 * `defaultFolders` create subfolders NESTED on disk
 * (`folders/<parent>/<child>/folder.json`). The cascade tests above build
 * folders with `writeResourceToFile`, which stores every folder flat under
 * `folders/<slug>/`, so they never exercised nested directories.
 */
const NESTED_SPEC: ProjectTypeSpec = {
  id: "f89-nested",
  name: "F89 Nested",
  folders: [{ name: "Depth One" }, { name: "Depth Two" }],
  defaultFolders: [
    { folder: "Depth One", name: "One Child" },
    { folder: "Depth Two", name: "Two Child" },
    { folder: "Two Child", name: "Two Grandchild" },
  ],
  defaultResources: [
    { folder: "Depth One", name: "One Top Res", type: "text", template: "a" },
    { folder: "One Child", name: "One Child Res", type: "text", template: "b" },
    { folder: "Depth Two", name: "Two Top Res", type: "text", template: "c" },
    { folder: "Two Child", name: "Two Mid Res", type: "text", template: "d" },
    {
      folder: "Two Grandchild",
      name: "Two Leaf Res",
      type: "text",
      template: "e",
    },
  ],
};

async function listRecursive(root: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  let names: string[] = [];
  try {
    names = (await fs.readdir(path.join(root, rel))).sort();
  } catch {
    return out;
  }
  for (const n of names) {
    const r = rel ? `${rel}/${n}` : n;
    const st = await fs.stat(path.join(root, r));
    out.push(st.isDirectory() ? `${r}/` : r);
    if (st.isDirectory()) out.push(...(await listRecursive(root, r)));
  }
  return out;
}

describe("models/trash — softDeleteFolder over createProjectFromType nested layouts (Feature 89, FR-8)", () => {
  async function build(): Promise<{
    tmp: string;
    byName: (n: string) => { id: string; slug?: string };
  }> {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gw-f89-nested-"));
    const created = await createProjectFromType({
      projectRoot: tmp,
      spec: NESTED_SPEC,
    });
    const all = [...created.folders, ...created.resources];
    return {
      tmp,
      byName: (n: string) => {
        const hit = all.find((x) => x.name === n);
        if (!hit) throw new Error(`fixture missing ${n}`);
        return hit;
      },
    };
  }

  it.each([
    {
      label: "depth 1: folder with one child folder",
      target: "Depth One",
      folders: ["One Child"],
      resources: ["One Top Res", "One Child Res"],
    },
    {
      label: "depth 2: folder with a child and a grandchild",
      target: "Depth Two",
      folders: ["Two Child", "Two Grandchild"],
      resources: ["Two Top Res", "Two Mid Res", "Two Leaf Res"],
    },
  ])(
    "$label: whole subtree lands in .trash/",
    async ({ target, folders, resources }) => {
      const { tmp, byName } = await build();
      try {
        const targetId = byName(target).id;
        const result = await softDeleteFolder(tmp, targetId as never);
        expect(result).toBe(path.join(tmp, ".trash"));

        const manifest = JSON.parse(
          await fs.readFile(
            path.join(tmp, ".trash", "meta", `folder-${targetId}.json`),
            "utf8",
          ),
        ) as TrashFolderManifest;
        const listed = manifest.descendants.map((d) => d.id).sort();
        const expected = [...folders, ...resources]
          .map((n) => byName(n).id)
          .sort();
        expect(listed).toEqual(expected);

        // Every resource sidecar is out of the live project.
        for (const n of resources) {
          expect(await readSidecar(tmp, byName(n).id as never)).toBeNull();
        }

        // The target's directory (and so every nested child directory) is
        // out of live folders/, and its descriptor plus each descendant
        // folder descriptor are present somewhere under .trash/folders/.
        const live = await listRecursive(path.join(tmp, "folders"));
        const trashed = await listRecursive(
          path.join(tmp, ".trash", "folders"),
        );
        const targetSlug = byName(target).slug as string;
        expect(live.filter((e) => e.startsWith(`${targetSlug}`))).toEqual([]);
        const trashedDescriptors = [];
        for (const e of trashed.filter((x) => x.endsWith("folder.json"))) {
          trashedDescriptors.push(
            (
              JSON.parse(
                await fs.readFile(
                  path.join(tmp, ".trash", "folders", e),
                  "utf8",
                ),
              ) as { id: string }
            ).id,
          );
        }
        expect(trashedDescriptors.sort()).toEqual(
          [targetId, ...folders.map((n) => byName(n).id)].sort(),
        );
      } finally {
        await removeDirRetry(tmp);
      }
    },
  );
});

/**
 * Feature 89, FR-9/FR-10 (Task 7): depth 3, a folder with both child folders
 * and resources, restore as one unit, and retry after a partial failure.
 */
const DEEP_SPEC: ProjectTypeSpec = {
  id: "f89-deep",
  name: "F89 Deep",
  folders: [{ name: "Deep Root" }, { name: "Wide Root" }, { name: "Keeper" }],
  defaultFolders: [
    { folder: "Deep Root", name: "Level A" },
    { folder: "Level A", name: "Level B" },
    { folder: "Level B", name: "Level C" },
    { folder: "Wide Root", name: "Wide Kid 1" },
    { folder: "Wide Root", name: "Wide Kid 2" },
  ],
  defaultResources: [
    { folder: "Deep Root", name: "Deep Res 0", type: "text", template: "a" },
    { folder: "Level A", name: "Deep Res A", type: "text", template: "b" },
    { folder: "Level B", name: "Deep Res B", type: "text", template: "c" },
    { folder: "Level C", name: "Deep Res C", type: "text", template: "d" },
    { folder: "Wide Root", name: "Wide Res 1", type: "text", template: "e" },
    { folder: "Wide Root", name: "Wide Res 2", type: "text", template: "f" },
    { folder: "Wide Kid 1", name: "Wide Kid Res", type: "text", template: "g" },
    { folder: "Keeper", name: "Keeper Res", type: "text", template: "h" },
  ],
};

interface LiveFolder {
  id: string;
  parentId: string | null;
  name: string;
  orderIndex: number;
}

async function liveFolders(root: string): Promise<LiveFolder[]> {
  const out: LiveFolder[] = [];
  for (const e of await listRecursive(path.join(root, "folders"))) {
    if (!e.endsWith("folder.json")) continue;
    const f = JSON.parse(
      await fs.readFile(path.join(root, "folders", e), "utf8"),
    ) as {
      id: string;
      parentId?: string | null;
      name: string;
      orderIndex: number;
    };
    out.push({
      id: f.id,
      parentId: f.parentId ?? null,
      name: f.name,
      orderIndex: f.orderIndex,
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

describe("models/trash — softDeleteFolder deep and wide subtrees, restore, retry (Feature 89, FR-9, FR-10)", () => {
  async function build(): Promise<{
    tmp: string;
    byName: (n: string) => { id: string };
  }> {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gw-f89-deep-"));
    const created = await createProjectFromType({
      projectRoot: tmp,
      spec: DEEP_SPEC,
    });
    const all = [...created.folders, ...created.resources];
    return {
      tmp,
      byName: (n: string) => {
        const hit = all.find((x) => x.name === n);
        if (!hit) throw new Error(`fixture missing ${n}`);
        return hit;
      },
    };
  }

  const CASES = [
    {
      label: "depth 3",
      target: "Deep Root",
      folders: ["Level A", "Level B", "Level C"],
      resources: ["Deep Res 0", "Deep Res A", "Deep Res B", "Deep Res C"],
    },
    {
      label: "a folder holding child folders and resources",
      target: "Wide Root",
      folders: ["Wide Kid 1", "Wide Kid 2"],
      resources: ["Wide Res 1", "Wide Res 2", "Wide Kid Res"],
    },
  ];

  it.each(CASES)(
    "$label: every descendant is in .trash, listed as one entry, and restores as one unit",
    async ({ target, folders, resources }) => {
      const { tmp, byName } = await build();
      try {
        const targetId = byName(target).id;
        const before = await liveFolders(tmp);
        const sidecarsBefore = new Map<
          string,
          Record<string, unknown> | null
        >();
        for (const n of resources) {
          sidecarsBefore.set(n, await readSidecar(tmp, byName(n).id as never));
        }

        await softDeleteFolder(tmp, targetId as never);

        const trashedIds: string[] = [];
        for (const e of await listRecursive(
          path.join(tmp, ".trash", "folders"),
        )) {
          if (!e.endsWith("folder.json")) continue;
          trashedIds.push(
            (
              JSON.parse(
                await fs.readFile(
                  path.join(tmp, ".trash", "folders", e),
                  "utf8",
                ),
              ) as { id: string }
            ).id,
          );
        }
        expect(trashedIds.sort()).toEqual(
          [targetId, ...folders.map((n) => byName(n).id)].sort(),
        );
        for (const n of resources) {
          expect(
            await pathExists(
              path.join(
                tmp,
                ".trash",
                "meta",
                `resource-${byName(n).id}.meta.json`,
              ),
            ),
          ).toBe(true);
        }
        const live = (await liveFolders(tmp)).map((f) => f.id);
        for (const id of [targetId, ...folders.map((n) => byName(n).id)]) {
          expect(live).not.toContain(id);
        }

        const manifest = JSON.parse(
          await fs.readFile(
            path.join(tmp, ".trash", "meta", `folder-${targetId}.json`),
            "utf8",
          ),
        ) as TrashFolderManifest;
        expect(manifest.descendants.map((d) => d.id).sort()).toEqual(
          [...folders, ...resources].map((n) => byName(n).id).sort(),
        );

        const listed = await listTrashedItems(tmp);
        expect(listed.folders.map((f) => f.id)).toEqual([targetId]);
        expect(listed.folders[0]?.descendants.map((d) => d.id).sort()).toEqual(
          [...folders, ...resources].map((n) => byName(n).id).sort(),
        );
        expect(listed.resources).toEqual([]);

        const restored = await restoreFolder(tmp, targetId as never);
        expect(restored.renamed).toBe(false);
        expect(restored.relocated).toBe(false);
        expect(await liveFolders(tmp)).toEqual(before);
        for (const n of resources) {
          const after = await readSidecar(tmp, byName(n).id as never);
          expect(after).not.toBeNull();
          expect(after?.["folderId"]).toEqual(
            sidecarsBefore.get(n)?.["folderId"],
          );
          expect(after?.["orderIndex"]).toEqual(
            sidecarsBefore.get(n)?.["orderIndex"],
          );
        }
        expect((await listTrashedItems(tmp)).folders).toEqual([]);
        expect(
          await listRecursive(path.join(tmp, ".trash", "folders")),
        ).toEqual([]);
      } finally {
        await removeDirRetry(tmp);
      }
    },
  );

  it("a failure partway through is reported, and a retry completes the subtree with the full manifest", async () => {
    const { tmp, byName } = await build();
    const lockedDir = path.join(tmp, "folders", "deep-root");
    try {
      const targetId = byName("Deep Root").id;
      const all = [
        "Level A",
        "Level B",
        "Level C",
        "Deep Res 0",
        "Deep Res A",
        "Deep Res B",
        "Deep Res C",
      ].map((n) => byName(n).id);
      // A read-only parent directory makes moving its child out fail
      // partway through the cascade (the deeper moves have already happened).
      await fs.chmod(lockedDir, 0o555);
      await expect(softDeleteFolder(tmp, targetId as never)).rejects.toThrow();
      await fs.chmod(lockedDir, 0o755);

      // Nothing is silently half-deleted: the target is still live, so the
      // writer was told and can retry.
      expect((await liveFolders(tmp)).map((f) => f.id)).toContain(targetId);

      await softDeleteFolder(tmp, targetId as never);

      const manifest = JSON.parse(
        await fs.readFile(
          path.join(tmp, ".trash", "meta", `folder-${targetId}.json`),
          "utf8",
        ),
      ) as TrashFolderManifest;
      expect(manifest.descendants.map((d) => d.id).sort()).toEqual(
        [...all].sort(),
      );
      const live = (await liveFolders(tmp)).map((f) => f.id);
      for (const id of [targetId, ...all]) expect(live).not.toContain(id);

      const listed = await listTrashedItems(tmp);
      expect(listed.folders.map((f) => f.id)).toEqual([targetId]);
      expect(listed.folders[0]?.descendants).toHaveLength(all.length);

      await restoreFolder(tmp, targetId as never);
      const restoredIds = (await liveFolders(tmp)).map((f) => f.id);
      for (const n of ["Deep Root", "Level A", "Level B", "Level C"]) {
        expect(restoredIds).toContain(byName(n).id);
      }
      for (const n of ["Deep Res 0", "Deep Res C"]) {
        expect(await readSidecar(tmp, byName(n).id as never)).not.toBeNull();
      }
    } finally {
      await fs.chmod(lockedDir, 0o755).catch(() => undefined);
      await removeDirRetry(tmp);
    }
  });
});

describe("F87 D-36: softDeleteFolder against a referencing Point of View", () => {
  async function run(
    schema: SchemaState,
    withMultiRefField = false,
  ): Promise<Record<string, unknown>> {
    const f = await makeRefFixture("gw-f87-folder-", {
      schema,
      withMultiRefField,
      targetInFolder: true,
    });
    try {
      await softDeleteFolder(f.root, f.folderId as string);
      return await readOtherUserMetadata(f);
    } finally {
      await removeDirRetry(f.projectsDir);
    }
  }

  it("never-edited schema: pov of a resource outside the folder reads {id: null, name} after the folder is deleted", async () => {
    expect((await run("never-edited"))["pov"]).toEqual({
      id: null,
      name: "Mara",
    });
  });

  it("schema-edited project: pov of a resource outside the folder reads {id: null, name} after the folder is deleted", async () => {
    expect((await run("schema-edited"))["pov"]).toEqual({
      id: null,
      name: "Mara",
    });
  });

  it("persisted schema without a pov field: pov of a resource outside the folder is left unchanged after the folder is deleted", async () => {
    const pov = (await run("schema-without-pov"))["pov"] as { id: unknown };
    expect(pov.id).not.toBeNull();
    expect(typeof pov.id).toBe("string");
  });

  it("multi-resource-ref field: the entry naming a resource in the folder is cleared and the other entry is kept", async () => {
    expect((await run("schema-edited", true))["characters"]).toEqual([
      { id: null, name: "Mara" },
      { id: "11111111-1111-4111-8111-111111111111", name: "Keep" },
    ]);
  });
});

describe("models/trash — undeclared folder.json key round trip (Feature 102 FR-2 (b))", () => {
  const UNDECLARED_KEY = "futureMetadata";
  const UNDECLARED_VALUE = { notes: "kept?", fields: { mood: "calm" } };

  async function readJson(p: string): Promise<Record<string, unknown>> {
    return JSON.parse(await fs.readFile(p, "utf8")) as Record<string, unknown>;
  }

  /** Writes the folder, then adds an undeclared key to its on-disk folder.json. */
  async function writeFolderWithUndeclaredKey(
    root: string,
    name: string,
    parentFolderId?: string,
  ): Promise<ReturnType<typeof createFolderResource>> {
    const folder = createFolderResource({ name, parentFolderId });
    await writeResourceToFile(root, folder);
    const file = path.join(root, "folders", folder.slug, "folder.json");
    const onDisk = await readJson(file);
    await fs.writeFile(
      file,
      JSON.stringify(
        { ...onDisk, [UNDECLARED_KEY]: UNDECLARED_VALUE },
        null,
        2,
      ),
      "utf8",
    );
    return folder;
  }

  it("records whether an undeclared key survives trash and restore, for a folder and its nested subfolders", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-trash-undeclared-key-"),
    );
    try {
      const top = await writeFolderWithUndeclaredKey(tmp, "Top Folder");
      const mid = await writeFolderWithUndeclaredKey(tmp, "Mid Folder", top.id);
      const leaf = await writeFolderWithUndeclaredKey(
        tmp,
        "Leaf Folder",
        mid.id,
      );
      const folders = [top, mid, leaf];

      const liveFile = (f: { slug: string }): string =>
        path.join(tmp, "folders", f.slug, "folder.json");
      const trashedFile = (f: { slug: string }): string =>
        path.join(tmp, ".trash", "folders", f.slug, "folder.json");

      for (const f of folders) {
        expect((await readJson(liveFile(f)))[UNDECLARED_KEY]).toEqual(
          UNDECLARED_VALUE,
        );
      }

      await softDeleteFolder(tmp, top.id);

      const afterTrash = await Promise.all(
        folders.map(
          async (f) => (await readJson(trashedFile(f)))[UNDECLARED_KEY],
        ),
      );
      const manifest = await readJson(
        path.join(tmp, ".trash", "meta", `folder-${top.id}.json`),
      );
      const hasKeyInManifest = UNDECLARED_KEY in (manifest["folder"] as object);

      const listed = await listTrashedItems(tmp);
      expect(listed.folders.map((f) => f.id)).toEqual([top.id]);

      await restoreFolder(tmp, top.id);

      const afterRestore = await Promise.all(
        folders.map(async (f) => (await readJson(liveFile(f)))[UNDECLARED_KEY]),
      );

      console.log(
        `[FR-2 (b)] after trash (descriptor file, top/mid/leaf): ${JSON.stringify(afterTrash)}; ` +
          `manifest.folder has key: ${hasKeyInManifest}; ` +
          `after restore (top/mid/leaf): ${JSON.stringify(afterRestore)}`,
      );

      // First-run observations, pinned.
      expect(afterTrash).toEqual([
        UNDECLARED_VALUE,
        UNDECLARED_VALUE,
        UNDECLARED_VALUE,
      ]);
      expect(hasKeyInManifest).toBe(false);
      expect(afterRestore).toEqual([undefined, undefined, undefined]);
    } finally {
      await removeDirRetry(tmp);
    }
  });
});

describe("models/trash — folder sidecar moves with the folder (Feature 102 FR-6)", () => {
  const FOLDER_SIDECAR = {
    userMetadata: { notes: "A note", mood: "calm", tags: ["a", "b"] },
    resourceSubtype: "Act",
  };

  const sidecarFile = (root: string, id: string): string =>
    path.join(root, "meta", `folder-${id}.meta.json`);
  const trashedSidecarFile = (root: string, id: string): string =>
    path.join(root, ".trash", "meta", `folder-${id}.meta.json`);

  async function withTmp(fn: (root: string) => Promise<void>): Promise<void> {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-trash-folder-sidecar-"),
    );
    try {
      await fn(tmp);
    } finally {
      await removeDirRetry(tmp);
    }
  }

  async function writeFolderSidecar(
    root: string,
    id: string,
    body: object = FOLDER_SIDECAR,
  ): Promise<string> {
    await fs.mkdir(path.join(root, "meta"), { recursive: true });
    const text = JSON.stringify(body, null, 2);
    await fs.writeFile(sidecarFile(root, id), text, "utf8");
    return text;
  }

  it("round-trips the sidecar byte-identical for a folder and its nested subfolders, whose folder.json carries an undeclared key", async () => {
    await withTmp(async (tmp) => {
      const top = createFolderResource({ name: "Top" });
      await writeResourceToFile(tmp, top);
      const mid = createFolderResource({ name: "Mid", parentFolderId: top.id });
      await writeResourceToFile(tmp, mid);
      const leaf = createFolderResource({
        name: "Leaf",
        parentFolderId: mid.id,
      });
      await writeResourceToFile(tmp, leaf);
      const file = path.join(tmp, "folders", top.slug, "folder.json");
      const onDisk = JSON.parse(await fs.readFile(file, "utf8")) as object;
      await fs.writeFile(
        file,
        JSON.stringify({ ...onDisk, futureMetadata: { x: 1 } }),
        "utf8",
      );
      const originals = new Map<string, string>();
      for (const f of [top, mid, leaf]) {
        originals.set(
          f.id,
          await writeFolderSidecar(tmp, f.id, {
            userMetadata: { notes: `note ${f.name}`, mood: f.name },
            resourceSubtype: `sub-${f.name}`,
          }),
        );
      }

      await softDeleteFolder(tmp, top.id);
      for (const f of [top, mid, leaf]) {
        expect(await pathExists(sidecarFile(tmp, f.id))).toBe(false);
        expect(await fs.readFile(trashedSidecarFile(tmp, f.id), "utf8")).toBe(
          originals.get(f.id),
        );
      }
      const listed = await listTrashedItems(tmp);
      expect(listed.folders.map((f) => f.id)).toEqual([top.id]);

      await restoreFolder(tmp, top.id);
      for (const f of [top, mid, leaf]) {
        expect(await fs.readFile(sidecarFile(tmp, f.id), "utf8")).toBe(
          originals.get(f.id),
        );
        expect(await pathExists(trashedSidecarFile(tmp, f.id))).toBe(false);
        const value = await readFolderSidecar(tmp, f.id);
        expect(value.notes).toBe(`note ${f.name}`);
        expect(value.fieldValues).toEqual({ mood: f.name });
        expect(value.resourceSubtype).toBe(`sub-${f.name}`);
      }
    });
  });

  it("trashes and restores a folder with no sidecar without creating one", async () => {
    await withTmp(async (tmp) => {
      const folder = createFolderResource({ name: "Bare" });
      await writeResourceToFile(tmp, folder);

      await softDeleteFolder(tmp, folder.id);
      expect(await pathExists(trashedSidecarFile(tmp, folder.id))).toBe(false);
      expect(await pathExists(sidecarFile(tmp, folder.id))).toBe(false);

      await restoreFolder(tmp, folder.id);
      expect(await pathExists(sidecarFile(tmp, folder.id))).toBe(false);
      expect(await pathExists(trashedSidecarFile(tmp, folder.id))).toBe(false);
    });
  });

  it("carries the sidecar with the folder on a restore conflict (parent gone, name clash)", async () => {
    await withTmp(async (tmp) => {
      const parent = createFolderResource({ name: "Parent" });
      await writeResourceToFile(tmp, parent);
      const child = createFolderResource({
        name: "Child",
        parentFolderId: parent.id,
      });
      await writeResourceToFile(tmp, child);
      const original = await writeFolderSidecar(tmp, child.id);

      await softDeleteFolder(tmp, child.id);
      await softDeleteFolder(tmp, parent.id);
      expect(await pathExists(sidecarFile(tmp, child.id))).toBe(false);
      expect(await pathExists(trashedSidecarFile(tmp, child.id))).toBe(true);
      // A new root folder now holds the name the child will restore under.
      const clash = createFolderResource({ name: "Child" });
      await writeResourceToFile(tmp, clash);

      const result = await restoreFolder(tmp, child.id);
      expect(result.relocated).toBe(true);
      expect(result.renamed).toBe(true);
      expect(await fs.readFile(sidecarFile(tmp, child.id), "utf8")).toBe(
        original,
      );
      expect(await pathExists(trashedSidecarFile(tmp, child.id))).toBe(false);
    });
  });

  it("leaves the sidecar of a folder still in the tree untouched", async () => {
    await withTmp(async (tmp) => {
      const trashed = createFolderResource({ name: "Gone" });
      const kept = createFolderResource({ name: "Kept" });
      await writeResourceToFile(tmp, trashed);
      await writeResourceToFile(tmp, kept);
      const keptText = await writeFolderSidecar(tmp, kept.id, {
        userMetadata: { notes: "stay" },
      });
      await writeFolderSidecar(tmp, trashed.id);

      await softDeleteFolder(tmp, trashed.id);
      expect(await fs.readFile(sidecarFile(tmp, kept.id), "utf8")).toBe(
        keptText,
      );
      await restoreFolder(tmp, trashed.id);
      expect(await fs.readFile(sidecarFile(tmp, kept.id), "utf8")).toBe(
        keptText,
      );
    });
  });
});

describe("models/trash — folder sidecar purge sweep (Feature 102 FR-7)", () => {
  const sidecarFile = (root: string, id: string): string =>
    path.join(root, "meta", `folder-${id}.meta.json`);
  const trashedSidecarFile = (root: string, id: string): string =>
    path.join(root, ".trash", "meta", `folder-${id}.meta.json`);
  const body = (n: string): string =>
    JSON.stringify({ userMetadata: { notes: n } }, null, 2);

  async function withTmp(fn: (root: string) => Promise<void>): Promise<void> {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-trash-folder-purge-"),
    );
    try {
      await fn(tmp);
    } finally {
      await removeDirRetry(tmp);
    }
  }

  async function metaListing(root: string): Promise<string[]> {
    const names: string[] = [];
    for (const dir of [
      path.join(root, "meta"),
      path.join(root, ".trash", "meta"),
    ]) {
      try {
        for (const n of await fs.readdir(dir)) {
          if (n.startsWith("folder-") && n.endsWith(".meta.json")) {
            names.push(path.relative(root, path.join(dir, n)));
          }
        }
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    }
    return names.sort();
  }

  async function nested(root: string) {
    const top = createFolderResource({ name: "Top" });
    await writeResourceToFile(root, top);
    const leaf = createFolderResource({ name: "Leaf", parentFolderId: top.id });
    await writeResourceToFile(root, leaf);
    const kept = createFolderResource({ name: "Kept" });
    await writeResourceToFile(root, kept);
    await fs.mkdir(path.join(root, "meta"), { recursive: true });
    for (const f of [top, leaf, kept]) {
      await fs.writeFile(sidecarFile(root, f.id), body(f.name), "utf8");
    }
    return { top, leaf, kept };
  }

  it("purgeFolder removes the sidecar of the folder and every nested folder, leaving the tree folder's untouched", async () => {
    await withTmp(async (tmp) => {
      const { top, leaf, kept } = await nested(tmp);
      await softDeleteFolder(tmp, top.id);
      expect(await metaListing(tmp)).toEqual(
        [
          `.trash/meta/folder-${top.id}.meta.json`,
          `.trash/meta/folder-${leaf.id}.meta.json`,
          `meta/folder-${kept.id}.meta.json`,
        ].sort(),
      );

      await purgeFolder(tmp, top.id);
      expect(await metaListing(tmp)).toEqual([
        `meta/folder-${kept.id}.meta.json`,
      ]);
      expect(await fs.readFile(sidecarFile(tmp, kept.id), "utf8")).toBe(
        body("Kept"),
      );
    });
  });

  it("purge from Trash through purgeOneCore leaves no folder sidecar and a second purge does not throw", async () => {
    await withTmp(async (tmp) => {
      const { top, leaf, kept } = await nested(tmp);
      await softDeleteFolder(tmp, top.id);

      expect(await purgeOneCore(tmp, top.id)).toEqual({ id: top.id, ok: true });
      expect(await pathExists(trashedSidecarFile(tmp, leaf.id))).toBe(false);
      expect(await pathExists(trashedSidecarFile(tmp, top.id))).toBe(false);
      expect(await pathExists(sidecarFile(tmp, kept.id))).toBe(true);

      const again = await purgeOneCore(tmp, top.id);
      expect(again.id).toBe(top.id);
      expect(again.ok).toBe(false);
      expect(await metaListing(tmp)).toEqual([
        `meta/folder-${kept.id}.meta.json`,
      ]);
    });
  });

  it("purgeFolder re-run after an interrupted sweep (manifest and stray sidecar back) completes and removes the sidecar", async () => {
    await withTmp(async (tmp) => {
      const { top, leaf } = await nested(tmp);
      await softDeleteFolder(tmp, top.id);
      const manifestPath = path.join(
        tmp,
        ".trash",
        "meta",
        `folder-${top.id}.json`,
      );
      const manifest = await fs.readFile(manifestPath, "utf8");
      const strayTop = await fs.readFile(trashedSidecarFile(tmp, top.id));
      const strayLeaf = await fs.readFile(trashedSidecarFile(tmp, leaf.id));
      await purgeFolder(tmp, top.id);

      await fs.mkdir(path.dirname(manifestPath), { recursive: true });
      await fs.writeFile(manifestPath, manifest, "utf8");
      await fs.writeFile(trashedSidecarFile(tmp, top.id), strayTop);
      await fs.writeFile(trashedSidecarFile(tmp, leaf.id), strayLeaf);
      await purgeFolder(tmp, top.id);
      expect(await pathExists(trashedSidecarFile(tmp, top.id))).toBe(false);
      expect(await pathExists(trashedSidecarFile(tmp, leaf.id))).toBe(false);
      expect(await pathExists(manifestPath)).toBe(false);
    });
  });

  it("purges a folder that has no sidecar without error or creating one", async () => {
    await withTmp(async (tmp) => {
      const folder = createFolderResource({ name: "Bare" });
      await writeResourceToFile(tmp, folder);
      await softDeleteFolder(tmp, folder.id);

      await purgeFolder(tmp, folder.id);
      expect(await metaListing(tmp)).toEqual([]);
    });
  });

  it("purges a trashed folder whose sidecar stayed in Trash when its descriptor was missing at restore", async () => {
    await withTmp(async (tmp) => {
      const { top, leaf, kept } = await nested(tmp);
      await softDeleteFolder(tmp, top.id);
      // Lose the leaf's trashed descriptor, as the Task 10 gap describes.
      const dirs = await fs.readdir(path.join(tmp, ".trash", "folders"), {
        recursive: true,
      });
      for (const d of dirs) {
        const full = path.join(tmp, ".trash", "folders", d);
        if (!full.endsWith("folder.json")) continue;
        const parsed = JSON.parse(await fs.readFile(full, "utf8")) as {
          id: string;
        };
        if (parsed.id === leaf.id)
          await fs.rm(path.dirname(full), { recursive: true });
      }

      await purgeFolder(tmp, top.id);
      expect(await metaListing(tmp)).toEqual([
        `meta/folder-${kept.id}.meta.json`,
      ]);
    });
  });

  it("empty Trash (purgeBatchCore all) removes every trashed folder sidecar and none of the tree's", async () => {
    await withTmp(async (tmp) => {
      const { top, kept } = await nested(tmp);
      const other = createFolderResource({ name: "Other" });
      await writeResourceToFile(tmp, other);
      await fs.writeFile(sidecarFile(tmp, other.id), body("Other"), "utf8");
      await softDeleteFolder(tmp, top.id);
      await softDeleteFolder(tmp, other.id);

      const results = await purgeBatchCore(tmp, { all: true });
      expect(results.every((r) => r.ok)).toBe(true);
      expect(await metaListing(tmp)).toEqual([
        `meta/folder-${kept.id}.meta.json`,
      ]);
    });
  });
});
