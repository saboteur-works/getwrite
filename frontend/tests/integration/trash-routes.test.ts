/**
 * Integration tests for the Task 11 Trash list/restore/purge API routes
 * (`specs/features/trash-ui.md` FR-1/FR-2/FR-11/FR-12, resolved OQ-9/OQ-10):
 *
 * - `GET /api/project/[project-id]/trash`
 * - `POST /api/project/[project-id]/trash/restore`
 * - `POST /api/project/[project-id]/trash/purge`
 *
 * Exercises the actual route handlers against a `projectId`-scoped
 * `GETWRITE_PROJECTS_DIR`, per the pattern established in
 * `tests/integration/folder-delete-route.test.ts`.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateUUID } from "../../src/lib/models/uuid";
import {
  createFolderResource,
  createTextResource,
} from "../../src/lib/models/resource-factory";
import { writeResourceToFile } from "../../src/lib/models/resource-persistence";
import {
  purgeResourceSteps,
  softDeleteFolder,
  softDeleteResource,
} from "../../src/lib/models/trash";
import { removeDirRetry } from "../unit/helpers/fs-utils";

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
    path.join(os.tmpdir(), "gw-trash-routes-"),
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

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/project/[project-id]/trash", () => {
  it("returns trashed resources and top-level trashed folders, including a legacy item with no ref record/manifest", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resource = createTextResource({
        name: "Loose Draft",
        plainText: "content",
      });
      await writeResourceToFile(projectPath, resource);
      await softDeleteResource(projectPath, resource.id);

      const folder = createFolderResource({ name: "Chapter One" });
      await writeResourceToFile(projectPath, folder);
      const childResource = createTextResource({
        name: "Scene A",
        folderId: folder.id,
        plainText: "content",
      });
      await writeResourceToFile(projectPath, childResource);
      await softDeleteFolder(projectPath, folder.id);

      // Simulate a legacy item trashed before Task 4/6 existed: a bare
      // sidecar dropped directly into .trash/meta/ with no ref record file.
      const legacyId = generateUUID();
      await fs.writeFile(
        path.join(
          projectPath,
          ".trash",
          "meta",
          `resource-${legacyId}.meta.json`,
        ),
        JSON.stringify({ id: legacyId, name: "Legacy Item", type: "text" }),
        "utf8",
      );

      const { GET } =
        await import("../../app/api/project/[project-id]/trash/route");
      const res = await GET(
        new Request(`http://localhost/api/project/${projectId}/trash`) as never,
        { params: Promise.resolve({ "project-id": projectId }) },
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        resources: { id: string; originalName: string }[];
        folders: {
          id: string;
          originalName: string;
          descendants: { id: string; kind: string }[];
        }[];
      };

      const resourceIds = body.resources.map((r) => r.id);
      expect(resourceIds).toContain(resource.id);
      expect(resourceIds).toContain(legacyId);
      // The folder's own descendant resource is not listed as a separate
      // top-level resource entry — it's nested under the folder instead.
      expect(resourceIds).not.toContain(childResource.id);

      expect(body.folders).toHaveLength(1);
      expect(body.folders[0]?.id).toBe(folder.id);
      expect(body.folders[0]?.originalName).toBe("Chapter One");
      expect(
        body.folders[0]?.descendants.some((d) => d.id === childResource.id),
      ).toBe(true);
    });
  });

  it("resolves each descendant's original name, not only its id (Task 24, Finding 4)", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const folder = createFolderResource({ name: "Outline" });
      await writeResourceToFile(projectPath, folder);

      const nestedFolder = createFolderResource({
        name: "Nested Subplot",
        parentFolderId: folder.id,
      });
      await writeResourceToFile(projectPath, nestedFolder);

      const childResource = createTextResource({
        name: "Synthetic Core Properties Fixture",
        folderId: folder.id,
        plainText: "content",
      });
      await writeResourceToFile(projectPath, childResource);

      await softDeleteFolder(projectPath, folder.id);

      const { GET } =
        await import("../../app/api/project/[project-id]/trash/route");
      const res = await GET(
        new Request(`http://localhost/api/project/${projectId}/trash`) as never,
        { params: Promise.resolve({ "project-id": projectId }) },
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        folders: {
          id: string;
          descendants: { id: string; kind: string; name: string }[];
        }[];
      };

      const trashedFolder = body.folders.find((f) => f.id === folder.id);
      expect(trashedFolder).toBeTruthy();

      const resourceDescendant = trashedFolder!.descendants.find(
        (d) => d.id === childResource.id,
      );
      expect(resourceDescendant?.kind).toBe("resource");
      expect(resourceDescendant?.name).toBe(
        "Synthetic Core Properties Fixture",
      );

      const folderDescendant = trashedFolder!.descendants.find(
        (d) => d.id === nestedFolder.id,
      );
      expect(folderDescendant?.kind).toBe("folder");
      expect(folderDescendant?.name).toBe("Nested Subplot");
    });
  });

  it("resolves the project directory from projectId and returns 400 on a malformed non-UUID projectId", async () => {
    const { projectsDir } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const { GET } =
        await import("../../app/api/project/[project-id]/trash/route");
      const res = await GET(
        new Request("http://localhost/api/project/not-a-uuid/trash") as never,
        { params: Promise.resolve({ "project-id": "not-a-uuid" }) },
      );

      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("Invalid projectId");
    });
  });
});

describe("POST /api/project/[project-id]/trash/restore", () => {
  it("restores a batch of ids, reporting one outcome per id", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resource = createTextResource({
        name: "Draft",
        plainText: "content",
      });
      await writeResourceToFile(projectPath, resource);
      await softDeleteResource(projectPath, resource.id);

      const { POST } =
        await import("../../app/api/project/[project-id]/trash/restore/route");
      const res = await POST(
        jsonRequest(`http://localhost/api/project/${projectId}/trash/restore`, {
          ids: [resource.id, "does-not-exist"],
        }) as never,
        { params: Promise.resolve({ "project-id": projectId }) },
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        results: { id: string; ok: boolean; error?: string }[];
      };
      expect(body.results).toHaveLength(2);

      const ok = body.results.find((r) => r.id === resource.id);
      expect(ok?.ok).toBe(true);

      const failed = body.results.find((r) => r.id === "does-not-exist");
      expect(failed?.ok).toBe(false);
      expect(failed?.error).toBeTruthy();

      const restoredSidecar = JSON.parse(
        await fs.readFile(
          path.join(projectPath, "meta", `resource-${resource.id}.meta.json`),
          "utf8",
        ),
      );
      expect(restoredSidecar.name).toBe("Draft");
    });
  });
});

describe("POST /api/project/[project-id]/trash/purge", () => {
  it("purges a batch, reporting success for the rest when one item fails, never a whole-batch 500", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const good = createTextResource({ name: "Keep Gone", plainText: "x" });
      await writeResourceToFile(projectPath, good);
      await softDeleteResource(projectPath, good.id);

      const broken = createTextResource({ name: "Broken", plainText: "x" });
      await writeResourceToFile(projectPath, broken);
      await softDeleteResource(projectPath, broken.id);

      // Force `broken`'s purge sweep to fail at its first step, mirroring
      // trash-purge-sweep.test.ts's own vi.spyOn pattern on the exported
      // purgeResourceSteps object — the mechanism trash.ts documents as the
      // sanctioned way to simulate a mid-sweep failure.
      const spy = vi
        .spyOn(purgeResourceSteps, "removeIndexEntries")
        .mockImplementation(async (_projectRoot, resourceId) => {
          if (resourceId === broken.id) {
            throw new Error("simulated purge failure");
          }
        });

      try {
        const { POST } =
          await import("../../app/api/project/[project-id]/trash/purge/route");
        const res = await POST(
          jsonRequest(`http://localhost/api/project/${projectId}/trash/purge`, {
            ids: [good.id, broken.id],
          }) as never,
          { params: Promise.resolve({ "project-id": projectId }) },
        );

        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          results: { id: string; ok: boolean; error?: string }[];
        };
        expect(body.results).toHaveLength(2);

        const goodResult = body.results.find((r) => r.id === good.id);
        expect(goodResult?.ok).toBe(true);

        const brokenResult = body.results.find((r) => r.id === broken.id);
        expect(brokenResult?.ok).toBe(false);
        expect(brokenResult?.error).toBeTruthy();

        // The successful item is gone from trash...
        expect(
          await fs
            .stat(
              path.join(
                projectPath,
                ".trash",
                "meta",
                `resource-${good.id}.meta.json`,
              ),
            )
            .then(
              () => true,
              () => false,
            ),
        ).toBe(false);

        // ...but the failed item's trashed sidecar remains, since its sweep
        // failed before reaching that step.
        expect(
          await fs
            .stat(
              path.join(
                projectPath,
                ".trash",
                "meta",
                `resource-${broken.id}.meta.json`,
              ),
            )
            .then(
              () => true,
              () => false,
            ),
        ).toBe(true);
      } finally {
        spy.mockRestore();
      }
    });
  });

  it("supports { all: true } as Empty Trash, purging every currently trashed id", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceA = createTextResource({ name: "A", plainText: "x" });
      await writeResourceToFile(projectPath, resourceA);
      await softDeleteResource(projectPath, resourceA.id);

      const folder = createFolderResource({ name: "Folder" });
      await writeResourceToFile(projectPath, folder);
      await softDeleteFolder(projectPath, folder.id);

      const { POST } =
        await import("../../app/api/project/[project-id]/trash/purge/route");
      const res = await POST(
        jsonRequest(`http://localhost/api/project/${projectId}/trash/purge`, {
          all: true,
        }) as never,
        { params: Promise.resolve({ "project-id": projectId }) },
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        results: { id: string; ok: boolean }[];
      };
      const ids = body.results.map((r) => r.id);
      expect(ids).toContain(resourceA.id);
      expect(ids).toContain(folder.id);
      expect(body.results.every((r) => r.ok)).toBe(true);

      const { GET } =
        await import("../../app/api/project/[project-id]/trash/route");
      const listRes = await GET(
        new Request(`http://localhost/api/project/${projectId}/trash`) as never,
        { params: Promise.resolve({ "project-id": projectId }) },
      );
      const listBody = (await listRes.json()) as {
        resources: unknown[];
        folders: unknown[];
      };
      expect(listBody.resources).toHaveLength(0);
      expect(listBody.folders).toHaveLength(0);
    });
  });
});
