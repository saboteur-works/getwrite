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
  PurgeSweepError,
  purgeResourceSteps,
  softDeleteFolder,
  softDeleteResource,
} from "../../src/lib/models/trash";
import { removeDirRetry } from "../unit/helpers/fs-utils";
import * as trashCore from "../../src/lib/models/trash-core";
import { LIMITS_FILE_NAME } from "../../src/lib/sharing/limits-store";
import { LIMIT_REFUSAL_MESSAGES } from "../../src/lib/sharing/limits-copy";

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

function jsonRequest(
  url: string,
  body: unknown,
  classification?: string,
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (classification !== undefined) {
    headers["x-getwrite-classification"] = classification;
  }
  return new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function withSharingDir<T>(
  limitsText: string | null,
  fn: (sharingDir: string) => Promise<T>,
): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-trash-sharing-"));
  tmpDirs.push(dir);
  if (limitsText !== null) {
    await fs.writeFile(path.join(dir, LIMITS_FILE_NAME), limitsText, "utf8");
  }
  const original = process.env.GETWRITE_SHARING_DIR;
  process.env.GETWRITE_SHARING_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    if (original === undefined) delete process.env.GETWRITE_SHARING_DIR;
    else process.env.GETWRITE_SHARING_DIR = original;
  }
}

function limitsFile(permanentDeletion: boolean, others = true): string {
  return JSON.stringify({
    version: 1,
    limits: {
      projectDeletion: others,
      unlocking: others,
      locking: others,
      encryptionChanges: others,
      permanentDeletion,
    },
  });
}

async function exists(p: string): Promise<boolean> {
  return fs.stat(p).then(
    () => true,
    () => false,
  );
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
          ids: [resource.id, "00000000-0000-4000-8000-000000000001"],
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

      const failed = body.results.find(
        (r) => r.id === "00000000-0000-4000-8000-000000000001",
      );
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

  it("reports the actual resolved restoredName on a collision, chaining across repeated restores (Task 1, FR-1)", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const kept = createTextResource({ name: "Draft", plainText: "kept" });
      await writeResourceToFile(projectPath, kept);

      const trashed1 = createTextResource({
        name: "Draft",
        plainText: "first",
      });
      await writeResourceToFile(projectPath, trashed1);
      await softDeleteResource(projectPath, trashed1.id);

      const { POST } =
        await import("../../app/api/project/[project-id]/trash/restore/route");

      const res1 = await POST(
        jsonRequest(`http://localhost/api/project/${projectId}/trash/restore`, {
          ids: [trashed1.id],
        }) as never,
        { params: Promise.resolve({ "project-id": projectId }) },
      );
      const body1 = (await res1.json()) as {
        results: { id: string; ok: boolean; restoredName?: string }[];
      };
      const result1 = body1.results.find((r) => r.id === trashed1.id);
      expect(result1?.ok).toBe(true);
      expect(result1?.restoredName).toBe("Draft (restored)");

      const trashed2 = createTextResource({
        name: "Draft",
        plainText: "second",
      });
      await writeResourceToFile(projectPath, trashed2);
      await softDeleteResource(projectPath, trashed2.id);

      const res2 = await POST(
        jsonRequest(`http://localhost/api/project/${projectId}/trash/restore`, {
          ids: [trashed2.id],
        }) as never,
        { params: Promise.resolve({ "project-id": projectId }) },
      );
      const body2 = (await res2.json()) as {
        results: { id: string; ok: boolean; restoredName?: string }[];
      };
      const result2 = body2.results.find((r) => r.id === trashed2.id);
      expect(result2?.ok).toBe(true);
      expect(result2?.restoredName).toBe("Draft (restored 2)");
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
          jsonRequest(
            `http://localhost/api/project/${projectId}/trash/purge`,
            { ids: [good.id, broken.id] },
            "off",
          ) as never,
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

  it("surfaces a mid-sweep PurgeSweepError as that item's { ok: false, error } entry, continuing the rest of the batch", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const good = createTextResource({ name: "Keep Gone", plainText: "x" });
      await writeResourceToFile(projectPath, good);
      await softDeleteResource(projectPath, good.id);

      const broken = createTextResource({
        name: "Broken Mid-Sweep",
        plainText: "x",
      });
      await writeResourceToFile(projectPath, broken);
      await softDeleteResource(projectPath, broken.id);

      // Mirror trash-purge-sweep.test.ts's own vi.spyOn substitution on the
      // exported purgeResourceSteps object, but at a later step
      // ("purgeRevisions") than trash-routes.test.ts's other purge test uses,
      // so purgeResource throws an actual PurgeSweepError (rather than the
      // plain Error a mocked step directly throwing would produce) out
      // through the real POST route handler.
      const spy = vi
        .spyOn(purgeResourceSteps, "purgeRevisions")
        .mockImplementation(async (_projectRoot, resourceId) => {
          if (resourceId === broken.id) {
            throw new Error("simulated mid-sweep failure");
          }
        });

      try {
        const { POST } =
          await import("../../app/api/project/[project-id]/trash/purge/route");
        const res = await POST(
          jsonRequest(
            `http://localhost/api/project/${projectId}/trash/purge`,
            { ids: [good.id, broken.id] },
            "off",
          ) as never,
          { params: Promise.resolve({ "project-id": projectId }) },
        );

        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          results: { id: string; ok: boolean; error?: string }[];
        };
        expect(body.results).toHaveLength(2);

        // The rest of the batch completes: `good`'s purge succeeds despite
        // `broken`'s sweep failing.
        const goodResult = body.results.find((r) => r.id === good.id);
        expect(goodResult?.ok).toBe(true);
        expect(goodResult?.error).toBeUndefined();

        // `broken`'s entry surfaces the actual PurgeSweepError's message —
        // naming the failed step and the item — not a generic failure.
        const brokenResult = body.results.find((r) => r.id === broken.id);
        expect(brokenResult?.ok).toBe(false);
        const expectedMessage = new PurgeSweepError(
          "revisions",
          broken.id,
          new Error("simulated mid-sweep failure"),
        ).message;
        expect(brokenResult?.error).toBe(expectedMessage);

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
        // stopped before reaching the sidecar-removal step, and it stays
        // available for a retried purge (FR-18).
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
        jsonRequest(
          `http://localhost/api/project/${projectId}/trash/purge`,
          { all: true },
          "off",
        ) as never,
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

describe("permanentDeletion limit on the Trash routes (Feature 77)", () => {
  async function trashedFixture() {
    const fx = await makeTmpProjectsDir();
    const resource = createTextResource({ name: "Doomed", plainText: "x" });
    await writeResourceToFile(fx.projectPath, resource);
    await softDeleteResource(fx.projectPath, resource.id);
    const sidecar = path.join(
      fx.projectPath,
      ".trash",
      "meta",
      `resource-${resource.id}.meta.json`,
    );
    return { ...fx, resource, sidecar };
  }

  it.each([
    ["a list of ids", (id: string) => ({ ids: [id] })],
    ["all: true", () => ({ all: true })],
  ])(
    "refuses a confirmed device with the limit on (%s): 403 { error, limit }, core not called, Trash untouched",
    async (_label, makeBody) => {
      const { projectsDir, projectId, resource, sidecar } =
        await trashedFixture();
      const spy = vi.spyOn(trashCore, "purgeBatchCore");
      try {
        await withSharingDir(limitsFile(true), () =>
          withProjectsDirEnv(projectsDir, async () => {
            const { POST } =
              await import("../../app/api/project/[project-id]/trash/purge/route");
            const res = await POST(
              jsonRequest(
                `http://localhost/api/project/${projectId}/trash/purge`,
                makeBody(resource.id),
                "confirmed:d1",
              ) as never,
              { params: Promise.resolve({ "project-id": projectId }) },
            );
            expect(res.status).toBe(403);
            const json = (await res.json()) as { error: string; limit: string };
            expect(json.limit).toBe("permanentDeletion");
            expect(json.error).toBe(LIMIT_REFUSAL_MESSAGES.permanentDeletion);
          }),
        );
        expect(spy).not.toHaveBeenCalled();
        expect(await exists(sidecar)).toBe(true);
      } finally {
        spy.mockRestore();
      }
    },
  );

  it("refuses a paired device whose body is not valid JSON (decided before parsing)", async () => {
    const { projectsDir, projectId } = await trashedFixture();
    await withSharingDir(limitsFile(true), () =>
      withProjectsDirEnv(projectsDir, async () => {
        const { POST } =
          await import("../../app/api/project/[project-id]/trash/purge/route");
        const res = await POST(
          new Request(`http://localhost/api/project/${projectId}/trash/purge`, {
            method: "POST",
            headers: { "x-getwrite-classification": "confirmed:d1" },
            body: "not json",
          }) as never,
          { params: Promise.resolve({ "project-id": projectId }) },
        );
        expect(res.status).toBe(403);
      }),
    );
  });

  it("keeps the 400 for a non-JSON body from the window", async () => {
    const { projectsDir, projectId } = await trashedFixture();
    await withSharingDir(limitsFile(true), () =>
      withProjectsDirEnv(projectsDir, async () => {
        const { POST } =
          await import("../../app/api/project/[project-id]/trash/purge/route");
        const res = await POST(
          new Request(`http://localhost/api/project/${projectId}/trash/purge`, {
            method: "POST",
            headers: { "x-getwrite-classification": "window" },
            body: "not json",
          }) as never,
          { params: Promise.resolve({ "project-id": projectId }) },
        );
        expect(res.status).toBe(400);
      }),
    );
  });

  it("treats a missing header as paired: refused with the limit on", async () => {
    const { projectsDir, projectId, resource, sidecar } =
      await trashedFixture();
    await withSharingDir(limitsFile(true), () =>
      withProjectsDirEnv(projectsDir, async () => {
        const { POST } =
          await import("../../app/api/project/[project-id]/trash/purge/route");
        const res = await POST(
          jsonRequest(`http://localhost/api/project/${projectId}/trash/purge`, {
            ids: [resource.id],
          }) as never,
          { params: Promise.resolve({ "project-id": projectId }) },
        );
        expect(res.status).toBe(403);
      }),
    );
    expect(await exists(sidecar)).toBe(true);
  });

  it.each([undefined, "", "garbage", "confirmed:"])(
    "refuses header %s with the limit off in the file: 403 permanentDeletion, Trash untouched",
    async (header) => {
      const { projectsDir, projectId, resource, sidecar } =
        await trashedFixture();
      await withSharingDir(limitsFile(false, false), () =>
        withProjectsDirEnv(projectsDir, async () => {
          const { POST } =
            await import("../../app/api/project/[project-id]/trash/purge/route");
          const res = await POST(
            jsonRequest(
              `http://localhost/api/project/${projectId}/trash/purge`,
              { ids: [resource.id] },
              header,
            ) as never,
            { params: Promise.resolve({ "project-id": projectId }) },
          );
          expect(res.status).toBe(403);
          const json = (await res.json()) as { limit: string };
          expect(json.limit).toBe("permanentDeletion");
        }),
      );
      expect(await exists(sidecar)).toBe(true);
    },
  );

  it("purges as before for a confirmed device with the limit off", async () => {
    const { projectsDir, projectId, resource, sidecar } =
      await trashedFixture();
    await withSharingDir(limitsFile(false), () =>
      withProjectsDirEnv(projectsDir, async () => {
        const { POST } =
          await import("../../app/api/project/[project-id]/trash/purge/route");
        const res = await POST(
          jsonRequest(
            `http://localhost/api/project/${projectId}/trash/purge`,
            { ids: [resource.id] },
            "confirmed:d1",
          ) as never,
          { params: Promise.resolve({ "project-id": projectId }) },
        );
        expect(res.status).toBe(200);
      }),
    );
    expect(await exists(sidecar)).toBe(false);
  });

  it.each(["off", "window"])(
    "never refuses %s and never reads the limits file even when it is unreadable",
    async (classification) => {
      const { projectsDir, projectId, resource, sidecar } =
        await trashedFixture();
      await withSharingDir(null, async (sharingDir) => {
        await fs.mkdir(path.join(sharingDir, LIMITS_FILE_NAME));
        const nodeFs = (await import("node:fs")).default;
        const readSpy = vi.spyOn(nodeFs, "readFileSync");
        try {
          await withProjectsDirEnv(projectsDir, async () => {
            const { POST } =
              await import("../../app/api/project/[project-id]/trash/purge/route");
            const res = await POST(
              jsonRequest(
                `http://localhost/api/project/${projectId}/trash/purge`,
                { ids: [resource.id] },
                classification,
              ) as never,
              { params: Promise.resolve({ "project-id": projectId }) },
            );
            expect(res.status).toBe(200);
          });
          expect(
            readSpy.mock.calls.filter((c) =>
              String(c[0]).endsWith(LIMITS_FILE_NAME),
            ),
          ).toHaveLength(0);
        } finally {
          readSpy.mockRestore();
        }
      });
      expect(await exists(sidecar)).toBe(false);
    },
  );

  it("does not refuse a confirmed device on the Trash list and restore routes with all five limits on (FR-12)", async () => {
    const { projectsDir, projectId, resource } = await trashedFixture();
    await withSharingDir(limitsFile(true), () =>
      withProjectsDirEnv(projectsDir, async () => {
        const { GET } =
          await import("../../app/api/project/[project-id]/trash/route");
        const listRes = await GET(
          new Request(`http://localhost/api/project/${projectId}/trash`, {
            headers: { "x-getwrite-classification": "confirmed:d1" },
          }) as never,
          { params: Promise.resolve({ "project-id": projectId }) },
        );
        expect(listRes.status).toBe(200);

        const { POST } =
          await import("../../app/api/project/[project-id]/trash/restore/route");
        const restoreRes = await POST(
          jsonRequest(
            `http://localhost/api/project/${projectId}/trash/restore`,
            { ids: [resource.id] },
            "confirmed:d1",
          ) as never,
          { params: Promise.resolve({ "project-id": projectId }) },
        );
        expect(restoreRes.status).toBe(200);
      }),
    );
  });
});
