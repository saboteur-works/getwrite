/**
 * Unit tests for POST /api/resource/[resource-id] (delete/copy actions,
 * 29-route tenant enforcement, Batch F).
 *
 * Exercises the actual route `POST` handler against a `projectId`-scoped
 * `GETWRITE_PROJECTS_DIR`, per the pattern established in `tags-api.test.ts`.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateUUID } from "../../src/lib/models/uuid";
import { writeSidecar } from "../../src/lib/models/sidecar";
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
    path.join(os.tmpdir(), "gw-resource-detail-route-"),
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

function actionRequest(resourceId: string, body: unknown): Request {
  return new Request(`http://localhost/api/resource/${resourceId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/resource/[resource-id] (projectId-based)", () => {
  it("resolves projectId to the on-disk project and soft-deletes the resource", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();
      await writeSidecar(projectPath, resourceId, {
        id: resourceId,
        name: "To Delete",
        type: "text",
      });

      const { POST } =
        await import("../../app/api/resource/[resource-id]/route");
      const res = await POST(
        actionRequest(resourceId, { projectId, action: "delete" }) as never,
        { params: Promise.resolve({ "resource-id": resourceId }) },
      );

      expect(res.status).toBe(200);
      const sidecarPath = path.join(
        projectPath,
        "meta",
        `resource-${resourceId}.meta.json`,
      );
      await expect(fs.stat(sidecarPath)).rejects.toThrow();
    });
  });

  it("returns the uniform 400 when projectId is not a well-formed UUID", async () => {
    const { projectsDir } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();
      const { POST } =
        await import("../../app/api/resource/[resource-id]/route");
      const res = await POST(
        actionRequest(resourceId, {
          projectId: "not-a-uuid",
          action: "delete",
        }) as never,
        { params: Promise.resolve({ "resource-id": resourceId }) },
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid projectId");
    });
  });
});
