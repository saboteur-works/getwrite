/**
 * Unit tests for POST /api/resource (resource creation, 29-route tenant
 * enforcement, Batch F).
 *
 * Exercises the actual route `POST` handler against a `projectId`-scoped
 * `GETWRITE_PROJECTS_DIR`, per the pattern established in `tags-api.test.ts`.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
    path.join(os.tmpdir(), "gw-resource-route-"),
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

describe("POST /api/resource (projectId-based)", () => {
  it("resolves projectId to the on-disk project and persists the resource", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const { POST } = await import("../../app/api/resource/route");
      const res = await POST(
        new Request("http://localhost/api/resource", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            resourceData: {
              name: "New Scene",
              type: "text",
              text: { plainText: "Once upon a time" },
            },
          }),
        }) as never,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        success: boolean;
        resource: { id: string };
      };
      expect(body.success).toBe(true);

      const sidecarPath = path.join(
        projectPath,
        "meta",
        `resource-${body.resource.id}.meta.json`,
      );
      await expect(fs.stat(sidecarPath)).resolves.toBeDefined();
    });
  });

  it("returns the uniform 400 when projectId is not a well-formed UUID", async () => {
    const { projectsDir } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const { POST } = await import("../../app/api/resource/route");
      const res = await POST(
        new Request("http://localhost/api/resource", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: "../../etc/passwd",
            resourceData: { name: "Scene", type: "text" },
          }),
        }) as never,
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid projectId");
    });
  });
});
