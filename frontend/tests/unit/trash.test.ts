import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createAndAssertProject } from "./helpers/project-creator";
import {
  softDeleteResource,
  restoreResource,
  purgeResource,
} from "../../src/lib/models/trash";
import * as trash from "../../src/lib/models/trash";
import { readSidecar } from "../../src/lib/models/sidecar";
import { removeDirRetry } from "./helpers/fs-utils";

describe("models/trash (T026)", () => {
  it("soft-deletes, restores, and purges a resource", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-trash-"));
    try {
      const specPath = path.join(
        process.cwd(),
        "..",
        "specs",
        "002-define-data-models",
        "project-types",
        "novel_project_type.json",
      );

      const { projectPath, folders, resources } = await createAndAssertProject(
        specPath,
        { projectRoot: tmp, name: "Trash Test" },
      );

      if (resources.length === 0) {
        // Nothing to test for trash behavior
        return;
      }

      const res = resources[0];

      // Ensure sidecar exists before deletion
      const before = await readSidecar(projectPath, res.id);
      expect(before).not.toBeNull();

      await softDeleteResource(projectPath, res.id);

      // Sidecar should no longer be readable from project root
      const after = await readSidecar(projectPath, res.id);
      expect(after).toBeNull();

      // Restore
      await restoreResource(projectPath, res.id);
      const restored = await readSidecar(projectPath, res.id);
      expect(restored).not.toBeNull();

      // Soft-delete again and purge
      await softDeleteResource(projectPath, res.id);
      await purgeResource(projectPath, res.id);

      // Sidecar should not be restorable
      const final = await readSidecar(projectPath, res.id);
      expect(final).toBeNull();
    } finally {
      await removeDirRetry(tmp);
    }
  });
});

describe("models/trash empty projectRoot guard (note_5effdebe)", () => {
  const id = "cccccccc-3333-4333-8333-333333333333";
  // Every exported entry point that takes a projectRoot. An empty string
  // used to resolve against the working directory (`path.join("", ".trash")`
  // is ".trash"), so each call runs with the cwd moved to an empty temp dir.
  const calls: [string, () => Promise<unknown>][] = [
    [
      "nullifyResourceRefs",
      () => trash.nullifyResourceRefs("", id, "x", ["pov"]),
    ],
    ["writeTrashRefRecord", () => trash.writeTrashRefRecord("", id, [])],
    ["readTrashRefRecord", () => trash.readTrashRefRecord("", id)],
    ["softDeleteResource", () => trash.softDeleteResource("", id)],
    ["softDeleteFolder", () => trash.softDeleteFolder("", id)],
    ["restoreResource", () => trash.restoreResource("", id)],
    ["restoreFolder", () => trash.restoreFolder("", id)],
    ["purgeTrashedRevisions", () => trash.purgeTrashedRevisions("", id)],
    ["purgeResource", () => trash.purgeResource("", id)],
    ["purgeFolder", () => trash.purgeFolder("", id)],
    ["listTrashedItems", () => trash.listTrashedItems("")],
    ["resolveTrashedItemKind", () => trash.resolveTrashedItemKind("", id)],
  ];

  it.each(calls)(
    "%s rejects an empty projectRoot and writes nothing relative to the cwd",
    async (_name, call) => {
      const originalCwd = process.cwd();
      const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "gw-trash-cwd-"));
      process.chdir(cwd);
      try {
        await expect(call()).rejects.toThrow("projectRoot is required");
        expect(await fs.readdir(cwd)).toEqual([]);
      } finally {
        process.chdir(originalCwd);
        await removeDirRetry(cwd);
      }
    },
  );
});
