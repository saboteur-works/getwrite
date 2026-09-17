import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createAndAssertProject } from "./helpers/project-creator";
import { softDeleteResource } from "../../src/lib/models/trash";
import { removeDirRetry } from "./helpers/fs-utils";
import {
  listTrashCore,
  restoreOneCore,
  purgeOneCore,
  purgeBatchCore,
} from "../../src/lib/models/trash-core";

describe("models/trash-core", () => {
  it("rejects an empty-string projectPath on every exported function", async () => {
    await expect(listTrashCore("")).rejects.toThrow();
    await expect(restoreOneCore("", "some-id")).rejects.toThrow();
    await expect(purgeOneCore("", "some-id")).rejects.toThrow();
    await expect(purgeBatchCore("", { all: true })).rejects.toThrow();
  });

  it("lists, restores, and purges a single trashed resource", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-trash-core-"),
    );
    try {
      const specPath = path.join(
        process.cwd(),
        "..",
        "specs",
        "002-define-data-models",
        "project-types",
        "novel_project_type.json",
      );

      const { projectPath, resources } = await createAndAssertProject(
        specPath,
        { projectRoot: tmp, name: "Trash Core Test" },
      );

      if (resources.length === 0) {
        return;
      }

      const res = resources[0];
      await softDeleteResource(projectPath, res.id);

      const listed = await listTrashCore(projectPath);
      expect(listed.resources.some((r) => r.id === res.id)).toBe(true);

      const restoreResult = await restoreOneCore(projectPath, res.id);
      expect(restoreResult.ok).toBe(true);

      await softDeleteResource(projectPath, res.id);
      const purgeResult = await purgeOneCore(projectPath, res.id);
      expect(purgeResult.ok).toBe(true);

      const afterPurge = await listTrashCore(projectPath);
      expect(afterPurge.resources.some((r) => r.id === res.id)).toBe(false);
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("purgeBatchCore resolves { all: true } to every trashed item", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-trash-core-batch-"),
    );
    try {
      const specPath = path.join(
        process.cwd(),
        "..",
        "specs",
        "002-define-data-models",
        "project-types",
        "novel_project_type.json",
      );

      const { projectPath, resources } = await createAndAssertProject(
        specPath,
        { projectRoot: tmp, name: "Trash Core Batch Test" },
      );

      if (resources.length === 0) {
        return;
      }

      const res = resources[0];
      await softDeleteResource(projectPath, res.id);

      const results = await purgeBatchCore(projectPath, { all: true });
      expect(results.some((r) => r.id === res.id && r.ok)).toBe(true);

      const afterPurge = await listTrashCore(projectPath);
      expect(afterPurge.resources.length).toBe(0);
    } finally {
      await removeDirRetry(tmp);
    }
  });
});
