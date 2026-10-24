/**
 * POST /api/resource/[resource-id]/noise-term (note_8cfdc308): dismisses or
 * restores one noise-flagged term for one entity. The server computes the new
 * list from the sidecar read inside the lock, so two dismissals made from
 * stale client copies both land.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateUUID } from "../../src/lib/models/uuid";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import { removeDirRetry } from "./helpers/fs-utils";

const tmpDirs: string[] = [];
const originalEnv = process.env.GETWRITE_PROJECTS_DIR;

afterEach(async () => {
  process.env.GETWRITE_PROJECTS_DIR = originalEnv;
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

async function makeProject(): Promise<{
  projectId: string;
  projectPath: string;
}> {
  const projectsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-noise-term-route-"),
  );
  tmpDirs.push(projectsDir);
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  const projectId = generateUUID();
  const projectPath = path.join(projectsDir, projectId);
  await fs.mkdir(projectPath, { recursive: true });
  return { projectId, projectPath };
}

async function post(resourceId: string, body: unknown): Promise<Response> {
  const { POST } =
    await import("../../app/api/resource/[resource-id]/noise-term/route");
  return POST(
    new Request(`http://localhost/api/resource/${resourceId}/noise-term`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ "resource-id": resourceId }) },
  );
}

describe("POST /api/resource/[resource-id]/noise-term", () => {
  it("dismisses a term and returns the stored list", async () => {
    const { projectId, projectPath } = await makeProject();
    const resourceId = generateUUID();
    await writeSidecar(projectPath, resourceId, {
      name: "Case",
      dismissedNoiseTerms: ["will"],
    });

    const res = await post(resourceId, {
      projectId,
      term: "Case",
      dismissed: true,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ dismissedNoiseTerms: ["will", "case"] });
    expect((await readSidecar(projectPath, resourceId))?.name).toBe("Case");
  });

  it("keeps both terms when two dismissals arrive at once", async () => {
    const { projectId, projectPath } = await makeProject();
    const resourceId = generateUUID();
    await writeSidecar(projectPath, resourceId, { name: "E" });

    await Promise.all([
      post(resourceId, { projectId, term: "case", dismissed: true }),
      post(resourceId, { projectId, term: "will", dismissed: true }),
    ]);

    const stored = await readSidecar(projectPath, resourceId);
    expect([...(stored?.dismissedNoiseTerms as string[])].sort()).toEqual([
      "case",
      "will",
    ]);
  });

  it("returns 400 for a blank term or a non-boolean dismissed, writing nothing", async () => {
    const { projectId, projectPath } = await makeProject();
    const resourceId = generateUUID();
    await writeSidecar(projectPath, resourceId, { name: "E" });

    expect(
      (await post(resourceId, { projectId, term: "  ", dismissed: true }))
        .status,
    ).toBe(400);
    expect(
      (await post(resourceId, { projectId, term: "case", dismissed: "yes" }))
        .status,
    ).toBe(400);
    expect(await readSidecar(projectPath, resourceId)).toEqual({ name: "E" });
  });

  it("returns 404 resource-gone when the resource has no sidecar", async () => {
    const { projectId } = await makeProject();
    const res = await post(generateUUID(), {
      projectId,
      term: "case",
      dismissed: true,
    });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("resource-gone");
  });

  it("returns the uniform 400 for a malformed projectId", async () => {
    await makeProject();
    const res = await post(generateUUID(), {
      projectId: "not-a-uuid",
      term: "case",
      dismissed: true,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid projectId");
  });
});
