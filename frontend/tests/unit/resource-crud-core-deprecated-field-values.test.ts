/**
 * Feature 89, Task 9 (FR-13): a deprecated custom field's value stays in the
 * sidecar's `userMetadata` on disk across a sidecar save that edits another
 * field. Runs `updateSidecarCore` against a throwaway projects directory
 * (GETWRITE_PROJECTS_DIR), never the repository's `projects/`.
 *
 * The update payload has the shape the page sends for a sidebar edit
 * (`handleChangeDynamicMetadata` in `app/(app)/page.tsx` spreads the
 * resource's whole `userMetadata` and overlays the edited key), so the
 * deprecated key travels with it.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateUUID } from "../../src/lib/models/uuid";
import { updateSidecarCore } from "../../src/lib/models/resource-crud-core";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import { removeDirRetry } from "./helpers/fs-utils";

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

describe("updateSidecarCore — deprecated field value survives a save (FR-13)", () => {
  it("leaves the deprecated key's value in userMetadata when another field is saved", async () => {
    const projectsDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "gw-deprecated-field-values-"),
    );
    tmpDirs.push(projectsDir);
    const projectId = generateUUID();
    const projectPath = path.join(projectsDir, projectId);
    await fs.mkdir(projectPath, { recursive: true });
    const resourceId = generateUUID();

    const original = process.env.GETWRITE_PROJECTS_DIR;
    process.env.GETWRITE_PROJECTS_DIR = projectsDir;
    try {
      await writeSidecar(projectPath, resourceId, {
        userMetadata: { "live-field": "before", "old-field": "kept on disk" },
      });
      const stored = await readSidecar(projectPath, resourceId);
      const userMetadata = stored?.userMetadata as Record<string, string>;

      await updateSidecarCore(projectId, resourceId, {
        userMetadata: { ...userMetadata, "live-field": "after" },
      });

      const after = await readSidecar(projectPath, resourceId);
      expect(after?.userMetadata).toEqual({
        "live-field": "after",
        "old-field": "kept on disk",
      });
    } finally {
      if (original === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
      else process.env.GETWRITE_PROJECTS_DIR = original;
    }
  });
});
