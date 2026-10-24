/**
 * POST /api/projects/[projectId]/reorder resolves the project from the
 * validated `projectId` (the directory basename). It used to take a
 * client-sent `projectRoot` and write sidecars under it unchecked: a probe
 * against a dev server created `<any folder>/meta/resource-probe.meta.json`.
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

async function makeTmp(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** A project whose `project.json` id differs from its directory name. */
async function makeProject(): Promise<{
  projectId: string;
  projectPath: string;
}> {
  const projectsDir = await makeTmp("gw-reorder-route-");
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  const projectId = generateUUID();
  const projectPath = path.join(projectsDir, projectId);
  await fs.mkdir(projectPath, { recursive: true });
  await fs.writeFile(
    path.join(projectPath, "project.json"),
    JSON.stringify({ id: generateUUID(), name: "Reorder" }),
  );
  return { projectId, projectPath };
}

async function post(projectId: string, body: unknown): Promise<Response> {
  const { POST } =
    await import("../../app/api/projects/[projectId]/reorder/route");
  return POST(
    new Request(`http://localhost/api/projects/${projectId}/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ projectId }) } as never,
  );
}

const exists = (p: string): Promise<boolean> =>
  fs.access(p).then(
    () => true,
    () => false,
  );

describe("POST /api/projects/[projectId]/reorder", () => {
  it("saves the order in the project named by its directory id", async () => {
    const { projectId, projectPath } = await makeProject();
    const resourceId = generateUUID();
    await writeSidecar(projectPath, resourceId, { name: "A", orderIndex: 0 });

    const res = await post(projectId, {
      folderOrder: [],
      resourceOrder: [{ id: resourceId, orderIndex: 4, folderId: null }],
    });

    expect(res.status).toBe(200);
    expect(await readSidecar(projectPath, resourceId)).toMatchObject({
      name: "A",
      orderIndex: 4,
    });
  });

  it("ignores a client-sent projectRoot and writes nothing under it", async () => {
    const { projectId, projectPath } = await makeProject();
    const outside = await makeTmp("gw-reorder-outside-");
    const resourceId = generateUUID();
    await writeSidecar(projectPath, resourceId, { name: "A", orderIndex: 0 });

    const res = await post(projectId, {
      folderOrder: [],
      resourceOrder: [{ id: resourceId, orderIndex: 7, folderId: null }],
      projectRoot: outside,
    });

    expect(res.status).toBe(200);
    expect(await exists(path.join(outside, "meta"))).toBe(false);
    expect((await readSidecar(projectPath, resourceId))?.orderIndex).toBe(7);
  });

  it("answers 400 for a projectId that is not a UUID", async () => {
    await makeProject();
    const res = await post("..", { folderOrder: [], resourceOrder: [] });
    expect(res.status).toBe(400);
  });

  it("answers 404 when no project exists at that id", async () => {
    await makeProject();
    const res = await post(generateUUID(), {
      folderOrder: [],
      resourceOrder: [],
    });
    expect(res.status).toBe(404);
  });
});
