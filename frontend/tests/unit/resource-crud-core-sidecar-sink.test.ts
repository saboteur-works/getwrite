/**
 * Feature 92 Task 17: `updateSidecarCore`, `setNoiseTermDismissedCore` and
 * `renameResourceSidecarCore` do their read-modify-write on the sidecar sink
 * (`mutateSidecar`), so the merge is computed from the value read inside the
 * lock. Real temp-dir project, no HTTP route or transport.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateUUID } from "../../src/lib/models/uuid";
import {
  renameResourceSidecarCore,
  setNoiseTermDismissedCore,
  updateSidecarCore,
} from "../../src/lib/models/resource-crud-core";
import {
  readSidecar,
  sidecarPathForProject,
  writeSidecar,
} from "../../src/lib/models/sidecar";
import { removeDirRetry } from "./helpers/fs-utils";

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

async function withProject<T>(
  fn: (ctx: {
    projectId: string;
    projectPath: string;
    resourceId: string;
  }) => Promise<T>,
): Promise<T> {
  const projectsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-resource-crud-core-sidecar-sink-"),
  );
  tmpDirs.push(projectsDir);
  const projectId = generateUUID();
  const projectPath = path.join(projectsDir, projectId);
  await fs.mkdir(projectPath, { recursive: true });
  const original = process.env.GETWRITE_PROJECTS_DIR;
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  try {
    return await fn({ projectId, projectPath, resourceId: generateUUID() });
  } finally {
    process.env.GETWRITE_PROJECTS_DIR = original;
  }
}

describe("updateSidecarCore on the sidecar sink", () => {
  it("merges over the stored value, drops wordCount, keeps orderIndex and folderId", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        name: "Old",
        orderIndex: 3,
        folderId: "folder-a",
        keep: "kept",
      });

      await updateSidecarCore(projectId, resourceId, {
        name: "New",
        orderIndex: 9,
        folderId: "folder-b",
        wordCount: 99,
      });

      const stored = await readSidecar(projectPath, resourceId);
      expect(stored).toMatchObject({
        name: "New",
        orderIndex: 3,
        folderId: "folder-a",
        keep: "kept",
      });
      expect(stored).not.toHaveProperty("wordCount");
    });
  });

  it("applies clearKeys and creates the sidecar when none exists", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await updateSidecarCore(projectId, resourceId, {
        name: "Fresh",
        orderIndex: 4,
        entityKind: "character",
      });
      expect(await readSidecar(projectPath, resourceId)).toMatchObject({
        name: "Fresh",
        orderIndex: 4,
        folderId: null,
        entityKind: "character",
      });

      await updateSidecarCore(projectId, resourceId, {}, ["entityKind"]);
      const stored = await readSidecar(projectPath, resourceId);
      expect(stored).not.toHaveProperty("entityKind");
      expect(stored?.name).toBe("Fresh");
    });
  });

  it("replaces an unreadable sidecar as before rather than throwing", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await fs.mkdir(path.join(projectPath, "meta"), { recursive: true });
      await fs.writeFile(
        sidecarPathForProject(projectPath, resourceId),
        "{not json",
        "utf8",
      );

      await updateSidecarCore(projectId, resourceId, { name: "Recovered" });

      expect(await readSidecar(projectPath, resourceId)).toMatchObject({
        name: "Recovered",
        orderIndex: 0,
        folderId: null,
      });
    });
  });

  it("keeps both changes when two updates of different keys run at once", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        name: "N",
        orderIndex: 0,
        folderId: null,
      });
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          updateSidecarCore(projectId, resourceId, { [`field${i}`]: i }),
        ),
      );
      const stored = await readSidecar(projectPath, resourceId);
      for (let i = 0; i < 20; i++) expect(stored?.[`field${i}`]).toBe(i);
    });
  });
});

describe("setNoiseTermDismissedCore on the sidecar sink", () => {
  it("keeps both terms when two different terms are dismissed at once", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        name: "E",
        orderIndex: 0,
        folderId: null,
      });
      const terms = Array.from({ length: 10 }, (_, i) => `term${i}`);
      await Promise.all(
        terms.map((t) =>
          setNoiseTermDismissedCore(projectId, resourceId, t, true),
        ),
      );
      const stored = await readSidecar(projectPath, resourceId);
      expect([...(stored?.dismissedNoiseTerms as string[])].sort()).toEqual(
        [...terms].sort(),
      );
    });
  });
});

describe("renameResourceSidecarCore on the sidecar sink", () => {
  it("returns the updated object and writes it", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        name: "Old",
        orderIndex: 1,
        folderId: null,
      });
      const result = await renameResourceSidecarCore(
        projectId,
        resourceId,
        "Renamed",
      );
      expect(result).toEqual({
        name: "Renamed",
        orderIndex: 1,
        folderId: null,
      });
      expect(await readSidecar(projectPath, resourceId)).toEqual(result);
    });
  });

  it("returns null and writes nothing when the sidecar is missing", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      expect(
        await renameResourceSidecarCore(projectId, resourceId, "X"),
      ).toBeNull();
      expect(await readSidecar(projectPath, resourceId)).toBeNull();
    });
  });

  it("keeps a concurrent update's change when renaming at once", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        name: "Old",
        orderIndex: 0,
        folderId: null,
      });
      await Promise.all([
        renameResourceSidecarCore(projectId, resourceId, "Renamed"),
        updateSidecarCore(projectId, resourceId, { note: "n" }),
      ]);
      expect(await readSidecar(projectPath, resourceId)).toMatchObject({
        name: "Renamed",
        note: "n",
      });
    });
  });
});
