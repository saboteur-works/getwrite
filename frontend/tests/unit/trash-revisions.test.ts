import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createAndAssertProject } from "./helpers/project-creator";
import {
  softDeleteResource,
  restoreResource,
} from "../../src/lib/models/trash";
import {
  writeRevision,
  revisionDir,
  revisionsBaseDir,
} from "../../src/lib/models/revision";
import { removeDirRetry } from "./helpers/fs-utils";

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

const specPath = path.join(
  process.cwd(),
  "..",
  "specs",
  "002-define-data-models",
  "project-types",
  "novel_project_type.json",
);

describe("models/trash — revisions (FR-19)", () => {
  it("moves revisions into .trash/revisions/<resourceId>/ at delete time", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-trash-revisions-"),
    );
    try {
      const { projectPath, resources } = await createAndAssertProject(
        specPath,
        { projectRoot: tmp, name: "Trash Revisions Test" },
      );

      if (resources.length === 0) {
        return;
      }

      const res = resources[0];

      // Project creation already seeds an initial canonical v-1 revision;
      // write two further revisions to test moving multiple revisions.
      const rev2 = await writeRevision(projectPath, res.id, 2, "content v2");
      const rev3 = await writeRevision(projectPath, res.id, 3, "content v3");

      const originalDir2 = revisionDir(projectPath, res.id, rev2.versionNumber);
      const originalDir3 = revisionDir(projectPath, res.id, rev3.versionNumber);
      expect(await pathExists(originalDir2)).toBe(true);
      expect(await pathExists(originalDir3)).toBe(true);

      await softDeleteResource(projectPath, res.id);

      // Original revisions directory no longer exists.
      expect(await pathExists(revisionsBaseDir(projectPath, res.id))).toBe(
        false,
      );

      // Trash locations exist for both revisions.
      const trashDir2 = path.join(
        projectPath,
        ".trash",
        "revisions",
        res.id,
        `v-${rev2.versionNumber}`,
      );
      const trashDir3 = path.join(
        projectPath,
        ".trash",
        "revisions",
        res.id,
        `v-${rev3.versionNumber}`,
      );
      expect(await pathExists(trashDir2)).toBe(true);
      expect(await pathExists(trashDir3)).toBe(true);
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("moves revisions back to revisions/<resourceId>/ on restore", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-trash-revisions-restore-"),
    );
    try {
      const { projectPath, resources } = await createAndAssertProject(
        specPath,
        { projectRoot: tmp, name: "Trash Revisions Restore Test" },
      );

      if (resources.length === 0) {
        return;
      }

      const res = resources[0];

      const rev2 = await writeRevision(projectPath, res.id, 2, "content v2");
      const rev3 = await writeRevision(projectPath, res.id, 3, "content v3");

      await softDeleteResource(projectPath, res.id);
      await restoreResource(projectPath, res.id);

      const restoredDir2 = revisionDir(projectPath, res.id, rev2.versionNumber);
      const restoredDir3 = revisionDir(projectPath, res.id, rev3.versionNumber);
      expect(await pathExists(restoredDir2)).toBe(true);
      expect(await pathExists(restoredDir3)).toBe(true);

      // Trash no longer holds any revisions for this resource.
      const trashRevisionsForResource = path.join(
        projectPath,
        ".trash",
        "revisions",
        res.id,
      );
      expect(await pathExists(trashRevisionsForResource)).toBe(false);
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("does not create .trash/revisions/<resourceId>/ for a resource with zero revisions", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-trash-revisions-none-"),
    );
    try {
      const { projectPath, resources } = await createAndAssertProject(
        specPath,
        { projectRoot: tmp, name: "Trash Revisions None Test" },
      );

      if (resources.length === 0) {
        return;
      }

      const res = resources[0];

      // Remove the initial canonical revision project creation seeds, so
      // this resource genuinely has zero revisions on disk.
      await fs.rm(revisionsBaseDir(projectPath, res.id), {
        recursive: true,
        force: true,
      });
      expect(await pathExists(revisionsBaseDir(projectPath, res.id))).toBe(
        false,
      );

      // Should not throw for a resource with no revisions on disk.
      await softDeleteResource(projectPath, res.id);

      const trashRevisionsForResource = path.join(
        projectPath,
        ".trash",
        "revisions",
        res.id,
      );
      expect(await pathExists(trashRevisionsForResource)).toBe(false);

      const trashRevisionsDir = path.join(projectPath, ".trash", "revisions");
      expect(await pathExists(trashRevisionsDir)).toBe(false);
    } finally {
      await removeDirRetry(tmp);
    }
  });
});
