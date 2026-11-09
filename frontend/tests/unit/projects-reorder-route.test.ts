/**
 * POST /api/projects/[projectId]/reorder resolves the project from the
 * validated `projectId` (the directory basename). It used to take a
 * client-sent `projectRoot` and write sidecars under it unchecked: a probe
 * against a dev server created `<any folder>/meta/resource-probe.meta.json`.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateUUID } from "../../src/lib/models/uuid";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import { removeDirRetry } from "./helpers/fs-utils";

const removalControl = vi.hoisted(() => ({ fail: false }));

vi.mock("../../src/lib/models/saved-defaults-core", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/lib/models/saved-defaults-core")
    >();
  return {
    ...actual,
    removeCompileExclusions: (
      ...args: Parameters<typeof actual.removeCompileExclusions>
    ) =>
      removalControl.fail
        ? Promise.reject(new Error("disk full"))
        : actual.removeCompileExclusions(...args),
  };
});

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

  describe("Inbox compile exclusion clearing (Feature 106 FR-23)", () => {
    async function inboxProject(): Promise<{
      projectId: string;
      projectPath: string;
      inbox: string;
      other: string;
      item: string;
      sub: string;
      inSub: string;
    }> {
      const { projectId, projectPath } = await makeProject();
      const [inbox, other, sub] = [
        generateUUID(),
        generateUUID(),
        generateUUID(),
      ];
      const [item, inSub] = [generateUUID(), generateUUID()];
      const writeFolder = async (
        parts: string[],
        id: string,
        parentId: string | null,
      ): Promise<void> => {
        const dir = path.join(projectPath, "folders", ...parts);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(
          path.join(dir, "folder.json"),
          JSON.stringify({ id, name: id, parentId, orderIndex: 0 }),
        );
      };
      await writeFolder([inbox], inbox, null);
      await writeFolder([inbox, sub], sub, inbox);
      await writeFolder([other], other, null);
      for (const [id, folderId] of [
        [item, inbox],
        [inSub, sub],
      ]) {
        await fs.mkdir(path.join(projectPath, "resources", id), {
          recursive: true,
        });
        await writeSidecar(projectPath, id, { name: id, folderId });
      }
      await fs.writeFile(
        path.join(projectPath, "project.json"),
        JSON.stringify({
          id: projectId,
          name: "Reorder",
          config: {
            inboxFolderId: inbox,
            compileDefaults: { excludedResourceIds: [item, inSub] },
          },
        }),
      );
      return { projectId, projectPath, inbox, other, item, sub, inSub };
    }

    const excluded = async (projectPath: string): Promise<string[]> =>
      (
        JSON.parse(
          await fs.readFile(path.join(projectPath, "project.json"), "utf8"),
        ) as { config: { compileDefaults: { excludedResourceIds: string[] } } }
      ).config.compileDefaults.excludedResourceIds;

    it("clears the id of a resource moved out of the Inbox and sends no notice", async () => {
      const p = await inboxProject();
      const res = await post(p.projectId, {
        folderOrder: [],
        resourceOrder: [{ id: p.item, orderIndex: 0, folderId: p.other }],
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(await excluded(p.projectPath)).toEqual([p.inSub]);
    });

    it("clears every contained resource id when a folder is moved out", async () => {
      const p = await inboxProject();
      const res = await post(p.projectId, {
        folderOrder: [{ id: p.sub, orderIndex: 0, folderId: p.other }],
        resourceOrder: [],
      });
      expect(res.status).toBe(200);
      expect(await excluded(p.projectPath)).toEqual([p.item]);
    });

    it("leaves ids for a move within the Inbox subtree", async () => {
      const p = await inboxProject();
      await post(p.projectId, {
        folderOrder: [],
        resourceOrder: [{ id: p.item, orderIndex: 0, folderId: p.sub }],
      });
      expect((await excluded(p.projectPath)).sort()).toEqual(
        [p.item, p.inSub].sort(),
      );
    });

    it("answers 200 with a notice when the clearing fails and the move stands", async () => {
      const p = await inboxProject();
      removalControl.fail = true;
      try {
        const res = await post(p.projectId, {
          folderOrder: [],
          resourceOrder: [{ id: p.item, orderIndex: 0, folderId: p.other }],
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { ok: boolean; notice?: string };
        expect(body.ok).toBe(true);
        expect(body.notice).toMatch(/compile default was not cleared/);
        expect((await readSidecar(p.projectPath, p.item))?.folderId).toBe(
          p.other,
        );
      } finally {
        removalControl.fail = false;
      }
    });
  });
});
