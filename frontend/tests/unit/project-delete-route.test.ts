/**
 * Integration tests for the project delete route.
 *
 * Calls the POST handler against a temporary projects directory, asserting
 * requests are scoped by a server-validated `projectId` (resolved against
 * `GETWRITE_PROJECTS_DIR`) rather than a client-supplied `projectPath`.
 *
 * Runs in the node environment so Request/Response come from undici.
 */
// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "../../app/api/project/delete/route";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { generateUUID } from "../../src/lib/models/uuid";
import * as projectCrudCore from "../../src/lib/models/project-crud-core";
import { LIMITS_FILE_NAME } from "../../src/lib/sharing/limits-store";

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

async function makeProjectsDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-proj-delete-"));
  tmpDirs.push(dir);
  return dir;
}

async function withProjectsDir<T>(
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

async function writeProject(
  projectsDir: string,
  projectId: string,
): Promise<string> {
  const projectPath = path.join(projectsDir, projectId);
  await fs.mkdir(projectPath, { recursive: true });
  const proj = createProject({ name: "delete-me" });
  await fs.writeFile(
    path.join(projectPath, PROJECT_FILENAME),
    JSON.stringify(proj, null, 2),
    "utf8",
  );
  return projectPath;
}

function deleteRequest(
  body: unknown,
  classification: string | null = "off",
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (classification !== null) {
    headers["x-getwrite-classification"] = classification;
  }
  return new Request("http://localhost/api/project/delete", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function withSharingDir<T>(
  limitsText: string | null,
  fn: (sharingDir: string) => Promise<T>,
): Promise<T> {
  const dir = await makeProjectsDir();
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

function limitsFile(projectDeletion: boolean): string {
  return JSON.stringify({
    version: 1,
    limits: {
      projectDeletion,
      unlocking: true,
      locking: true,
      encryptionChanges: true,
      permanentDeletion: true,
    },
  });
}

describe("POST /api/project/delete", () => {
  it("removes the project directory for a valid projectId", async () => {
    const projectsDir = await makeProjectsDir();
    const projectId = generateUUID();
    const projectPath = await writeProject(projectsDir, projectId);

    const res = await withProjectsDir(projectsDir, () =>
      POST(deleteRequest({ projectId }) as never),
    );
    const json = await res.json();

    expect(json.success).toBe(true);
    await expect(fs.stat(projectPath)).rejects.toThrow();
  });

  it("returns the uniform 400 when projectId is not a well-formed UUID", async () => {
    const projectsDir = await makeProjectsDir();

    const res = await withProjectsDir(projectsDir, () =>
      POST(deleteRequest({ projectId: "../../etc/passwd" }) as never),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid projectId");
  });

  describe("projectDeletion limit (Feature 77)", () => {
    it("refuses a confirmed device with the limit on: 403 { error, limit }, core not called, project untouched", async () => {
      const projectsDir = await makeProjectsDir();
      const projectId = generateUUID();
      const projectPath = await writeProject(projectsDir, projectId);
      const spy = vi.spyOn(projectCrudCore, "deleteProjectCore");
      try {
        await withSharingDir(limitsFile(true), () =>
          withProjectsDir(projectsDir, async () => {
            const res = await POST(
              deleteRequest({ projectId }, "confirmed:d1") as never,
            );
            expect(res.status).toBe(403);
            const json = (await res.json()) as { error: string; limit: string };
            expect(json.limit).toBe("projectDeletion");
            expect(typeof json.error).toBe("string");
          }),
        );
        expect(spy).not.toHaveBeenCalled();
        await expect(fs.stat(projectPath)).resolves.toBeTruthy();
      } finally {
        spy.mockRestore();
      }
    });

    it("refuses before parsing the body (an unparseable body from a paired device is a 403, not a throw)", async () => {
      await withSharingDir(limitsFile(true), async () => {
        const res = await POST(
          new Request("http://localhost/api/project/delete", {
            method: "POST",
            headers: { "x-getwrite-classification": "confirmed:d1" },
            body: "not json",
          }) as never,
        );
        expect(res.status).toBe(403);
      });
    });

    it("treats a missing header as paired: refused with the limit on", async () => {
      const projectsDir = await makeProjectsDir();
      const projectId = generateUUID();
      const projectPath = await writeProject(projectsDir, projectId);
      await withSharingDir(limitsFile(true), () =>
        withProjectsDir(projectsDir, async () => {
          const res = await POST(deleteRequest({ projectId }, null) as never);
          expect(res.status).toBe(403);
        }),
      );
      await expect(fs.stat(projectPath)).resolves.toBeTruthy();
    });

    it.each([null, "", "garbage", "confirmed:"])(
      "refuses header %s with the limit off in the file: 403 projectDeletion, project untouched",
      async (header) => {
        const projectsDir = await makeProjectsDir();
        const projectId = generateUUID();
        const projectPath = await writeProject(projectsDir, projectId);
        await withSharingDir(limitsFile(false), () =>
          withProjectsDir(projectsDir, async () => {
            const res = await POST(
              deleteRequest({ projectId }, header) as never,
            );
            expect(res.status).toBe(403);
            const json = (await res.json()) as { limit: string };
            expect(json.limit).toBe("projectDeletion");
          }),
        );
        await expect(fs.stat(projectPath)).resolves.toBeTruthy();
      },
    );

    it("deletes as before for a confirmed device with the limit off", async () => {
      const projectsDir = await makeProjectsDir();
      const projectId = generateUUID();
      const projectPath = await writeProject(projectsDir, projectId);
      await withSharingDir(limitsFile(false), () =>
        withProjectsDir(projectsDir, async () => {
          const res = await POST(
            deleteRequest({ projectId }, "confirmed:d1") as never,
          );
          expect(res.status).toBe(200);
        }),
      );
      await expect(fs.stat(projectPath)).rejects.toThrow();
    });

    it.each(["off", "window"])(
      "never refuses %s and never reads the limits file even when it is unreadable",
      async (classification) => {
        const projectsDir = await makeProjectsDir();
        const projectId = generateUUID();
        const projectPath = await writeProject(projectsDir, projectId);
        // A directory where the file should be makes the read fail (EISDIR).
        await withSharingDir(null, async (sharingDir) => {
          await fs.mkdir(path.join(sharingDir, LIMITS_FILE_NAME));
          const readSpy = vi.spyOn(
            await import("node:fs").then((m) => m.default),
            "readFileSync",
          );
          try {
            await withProjectsDir(projectsDir, async () => {
              const res = await POST(
                deleteRequest({ projectId }, classification) as never,
              );
              expect(res.status).toBe(200);
            });
            const limitsReads = readSpy.mock.calls.filter((c) =>
              String(c[0]).endsWith(LIMITS_FILE_NAME),
            );
            expect(limitsReads).toHaveLength(0);
          } finally {
            readSpy.mockRestore();
          }
        });
        await expect(fs.stat(projectPath)).rejects.toThrow();
      },
    );
  });
});
