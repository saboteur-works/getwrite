/**
 * Unit tests for POST /api/resource/[resource-id]/delete (29-route tenant
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
import { writeSidecar } from "../../src/lib/models/sidecar";
import { removeDirRetry } from "./helpers/fs-utils";
import {
  makeRefFixture,
  readOtherUserMetadata,
  type SchemaState,
} from "./helpers/f87-reference-delete-fixture";

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
    path.join(os.tmpdir(), "gw-resource-delete-route-"),
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

function deleteRequest(resourceId: string, body: unknown): Request {
  return new Request(`http://localhost/api/resource/${resourceId}/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/resource/[resource-id]/delete (projectId-based)", () => {
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
        await import("../../app/api/resource/[resource-id]/delete/route");
      const res = await POST(
        deleteRequest(resourceId, { projectId }) as never,
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
        await import("../../app/api/resource/[resource-id]/delete/route");
      const res = await POST(
        deleteRequest(resourceId, { projectId: "not-a-uuid" }) as never,
        { params: Promise.resolve({ "resource-id": resourceId }) },
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid projectId");
    });
  });
});

describe("F87 D-36: POST /api/resource/[resource-id]/delete against a referencing Point of View", () => {
  async function run(
    schema: SchemaState,
    withMultiRefField = false,
  ): Promise<Record<string, unknown>> {
    const f = await makeRefFixture("gw-f87-route-", {
      schema,
      withMultiRefField,
    });
    tmpDirs.push(f.projectsDir);
    return withProjectsDirEnv(f.projectsDir, async () => {
      const { POST } =
        await import("../../app/api/resource/[resource-id]/delete/route");
      const res = await POST(
        deleteRequest(f.targetId, { projectId: f.projectId }) as never,
        { params: Promise.resolve({ "resource-id": f.targetId }) },
      );
      expect(res.status).toBe(200);
      return readOtherUserMetadata(f);
    });
  }

  it("never-edited schema: pov of the referencing resource reads {id: null, name} after the target is deleted", async () => {
    expect((await run("never-edited"))["pov"]).toEqual({
      id: null,
      name: "Mara",
    });
  });

  it("schema-edited project: pov of the referencing resource reads {id: null, name} after the target is deleted", async () => {
    expect((await run("schema-edited"))["pov"]).toEqual({
      id: null,
      name: "Mara",
    });
  });

  it("multi-resource-ref field: the entry naming the target is cleared and the other entry is kept", async () => {
    expect((await run("schema-edited", true))["characters"]).toEqual([
      { id: null, name: "Mara" },
      { id: "11111111-1111-4111-8111-111111111111", name: "Keep" },
    ]);
  });
});
