/**
 * Unit tests for Task 14 (`specs/features/entity-graph-connections-...`,
 * FR-12): `updateSidecarCore` (`resource-crud-core.ts`) must unconditionally
 * drop any saved entity-graph node position for a resource whenever
 * `clearKeys` includes `"entityKind"` — mirroring the server-side hook point
 * described in that task, exercised here directly against a real temp-dir
 * project (no HTTP route, no native transport), matching
 * `resource-crud-core-delete-folder.test.ts`'s fixture conventions.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateUUID } from "../../src/lib/models/uuid";
import { updateSidecarCore } from "../../src/lib/models/resource-crud-core";
import {
  loadEntityGraphPositions,
  saveEntityGraphPosition,
} from "../../src/lib/models/entity-graph-positions";
import { removeDirRetry } from "./helpers/fs-utils";

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

async function makeTmpProjectsDir(): Promise<{
  projectsDir: string;
  projectId: string;
  projectPath: string;
}> {
  const projectsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-resource-crud-core-entity-graph-position-"),
  );
  tmpDirs.push(projectsDir);
  const projectId = generateUUID();
  const projectPath = path.join(projectsDir, projectId);
  await fs.mkdir(projectPath, { recursive: true });
  return { projectsDir, projectId, projectPath };
}

async function withProjectsDirEnv<T>(
  projectsDir: string,
  fn: () => Promise<T>,
): Promise<T> {
  const originalEnv = process.env.GETWRITE_PROJECTS_DIR;
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  try {
    return await fn();
  } finally {
    process.env.GETWRITE_PROJECTS_DIR = originalEnv;
  }
}

describe("updateSidecarCore — entity-graph position cleanup on entity removal", () => {
  it("removes an entity's saved graph position when entityKind is cleared, leaving no surviving record", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();
      await saveEntityGraphPosition(projectPath, resourceId, 10, 20, [
        "authored",
      ]);

      await updateSidecarCore(projectId, resourceId, { title: "A Character" }, [
        "entityKind",
        "aliases",
      ]);

      const positions = await loadEntityGraphPositions(projectPath);
      expect(positions.find((r) => r.entityId === resourceId)).toBeUndefined();
    });
  });

  it("leaves another entity's saved position untouched", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();
      const otherEntityId = generateUUID();
      const other = await saveEntityGraphPosition(
        projectPath,
        otherEntityId,
        3,
        4,
        ["authored"],
      );
      await saveEntityGraphPosition(projectPath, resourceId, 1, 1, [
        "authored",
      ]);

      await updateSidecarCore(projectId, resourceId, {}, [
        "entityKind",
        "aliases",
      ]);

      const positions = await loadEntityGraphPositions(projectPath);
      expect(positions).toEqual([other]);
    });
  });

  it("does not touch the position store when clearKeys omits entityKind", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();
      const saved = await saveEntityGraphPosition(
        projectPath,
        resourceId,
        1,
        1,
        ["authored"],
      );

      await updateSidecarCore(projectId, resourceId, {}, ["wordCountGoal"]);

      const positions = await loadEntityGraphPositions(projectPath);
      expect(positions).toEqual([saved]);
    });
  });

  it("is a no-op, not an error, when the entity had no saved position", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();

      await expect(
        updateSidecarCore(projectId, resourceId, {}, ["entityKind"]),
      ).resolves.toBeUndefined();

      const positions = await loadEntityGraphPositions(projectPath);
      expect(positions).toEqual([]);
    });
  });
});
