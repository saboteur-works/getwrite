/**
 * Feature 102 FR-21 (owner decision 2026-11-07, superseding OQ-9): a Source
 * takes `entityKind` and `aliases` through `updateSidecarCore` like a text
 * resource, and Remove Entity (`clearKeys`) clears both.
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

async function withSource(
  run: (ctx: {
    projectId: string;
    resourceId: string;
    read: () => Promise<Record<string, unknown> | null>;
  }) => Promise<void>,
): Promise<void> {
  const projectsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-source-entity-"),
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
      id: resourceId,
      name: "Call notes",
      type: "source",
    } as Parameters<typeof writeSidecar>[2]);
    await run({
      projectId,
      resourceId,
      read: async () =>
        (await readSidecar(projectPath, resourceId)) as Record<
          string,
          unknown
        > | null,
    });
  } finally {
    if (original === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = original;
  }
}

describe("updateSidecarCore on a Source — entity fields", () => {
  it("stores entityKind and aliases", async () => {
    await withSource(async ({ projectId, resourceId, read }) => {
      await updateSidecarCore(projectId, resourceId, {
        entityKind: "interview",
        aliases: ["The call"],
      });
      const after = await read();
      expect(after?.entityKind).toBe("interview");
      expect(after?.aliases).toEqual(["The call"]);
      expect(after?.type).toBe("source");
    });
  });

  it("clearKeys removes both keys", async () => {
    await withSource(async ({ projectId, resourceId, read }) => {
      await updateSidecarCore(projectId, resourceId, {
        entityKind: "interview",
        aliases: ["The call"],
      });
      await updateSidecarCore(projectId, resourceId, {}, [
        "entityKind",
        "aliases",
      ]);
      const after = await read();
      expect(after).not.toHaveProperty("entityKind");
      expect(after).not.toHaveProperty("aliases");
    });
  });
});
