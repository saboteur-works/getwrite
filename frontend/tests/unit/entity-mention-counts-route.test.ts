/**
 * Unit tests for GET /api/project/[project-id]/entity-mention-counts.
 *
 * Exercises the route handler against a `projectId`-scoped
 * `GETWRITE_PROJECTS_DIR`, per the pattern established in
 * `entity-alias-table-route.test.ts`.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "../../app/api/project/[project-id]/entity-mention-counts/route";
import type { EntityMentionCounts } from "../../src/lib/models/mentions-core";
import { persistMentionIndex } from "../../src/lib/models/mention-index";
import { generateUUID } from "../../src/lib/models/uuid";
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
    path.join(os.tmpdir(), "gw-entity-mention-counts-route-"),
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

function makeGetRequest(projectId: string): NextRequest {
  const url = new URL(
    `http://localhost/api/project/${projectId}/entity-mention-counts`,
  );
  return new NextRequest(url.toString());
}

describe("GET /api/project/[project-id]/entity-mention-counts", () => {
  it("returns mention counts for a project with a built mention index", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const ariaId = "entity-aria";
      const brannId = "entity-brann";
      await persistMentionIndex(projectPath, {
        "resource-1": [
          {
            entityId: ariaId,
            resourceId: "resource-1",
            count: 2,
            offsets: [0, 10],
          },
          {
            entityId: brannId,
            resourceId: "resource-1",
            count: 1,
            offsets: [20],
          },
        ],
        "resource-2": [
          {
            entityId: ariaId,
            resourceId: "resource-2",
            count: 1,
            offsets: [5],
          },
        ],
      });

      const res = await GET(makeGetRequest(projectId), {
        params: Promise.resolve({ "project-id": projectId }),
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as Record<string, EntityMentionCounts>;
      // Aria: 3 occurrences (2 in resource-1, 1 in resource-2) across 2
      // documents. The two numbers differ, so a route that returned one
      // where the other is meant cannot pass by coincidence.
      expect(json).toEqual({
        [ariaId]: { mentions: 3, resources: 2 },
        [brannId]: { mentions: 1, resources: 1 },
      });
    });
  });

  it("returns an empty object for a project with no mention index yet", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const res = await GET(makeGetRequest(projectId), {
        params: Promise.resolve({ "project-id": projectId }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({});
    });
  });

  it("returns the uniform 400 when project-id is not a well-formed UUID", async () => {
    const { projectsDir } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const res = await GET(makeGetRequest("not-a-uuid"), {
        params: Promise.resolve({ "project-id": "not-a-uuid" }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid projectId");
    });
  });
});
