/**
 * Integration tests (remove-entity Task 12, done_when): exercises the REAL
 * persistence path — the actual `POST /api/resource/[resource-id]/sidecar`
 * route handler — against a real temp-directory project, proving that both
 * caller-side clearing paths wired onto `clearKeys` in Task 12
 * (`RemoveEntityControl.tsx`'s confirm handler and `EntitySection.tsx`'s
 * `withEntityKind` clear path) actually result in a persisted sidecar with
 * the expected keys absent, following the pattern established in
 * `tests/unit/resource-sidecar-route.test.ts` (Task 10/11) and
 * `tests/integration/entity-relationships.test.ts`.
 *
 * This intentionally does NOT mock `updateSidecar` — it drives the same
 * route handler `updateSidecar`'s HTTP transport calls, with request bodies
 * shaped exactly as the two callers now build them.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateUUID } from "../../src/lib/models/uuid";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import { mkdir } from "../../src/lib/models/io";
import { buildEntityAliasTable } from "../../src/lib/models/entity-alias-table";
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
    path.join(os.tmpdir(), "gw-remove-entity-integration-"),
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

function sidecarRequest(resourceId: string, body: unknown): Request {
  return new Request(`http://localhost/api/resource/${resourceId}/sidecar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Remove Entity end-to-end persistence (Task 12)", () => {
  it("RemoveEntityControl's confirm write leaves entityKind and aliases absent, every other field unchanged", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();
      await mkdir(path.join(projectPath, "resources", resourceId), {
        recursive: true,
      });
      await writeSidecar(projectPath, resourceId, {
        id: resourceId,
        name: "Aria",
        type: "text",
        entityKind: "character",
        aliases: ["Ari", "The Wanderer"],
        orderIndex: 2,
        folderId: "folder-9",
        status: "in-progress",
      });

      // Mirrors RemoveEntityControl.tsx's confirm handler: `updatedResource`
      // omits entityKind/aliases entirely (withoutEntityFields), and the
      // actual clearing is named via clearKeys.
      const { POST } =
        await import("../../app/api/resource/[resource-id]/sidecar/route");
      const res = await POST(
        sidecarRequest(resourceId, {
          projectId,
          updatedResource: {
            id: resourceId,
            name: "Aria",
            type: "text",
            orderIndex: 2,
            folderId: "folder-9",
            status: "in-progress",
          },
          clearKeys: ["entityKind", "aliases"],
        }) as never,
        { params: Promise.resolve({ "resource-id": resourceId }) },
      );

      expect(res.status).toBe(200);
      const sidecar = await readSidecar(projectPath, resourceId);
      expect(sidecar).not.toBeNull();
      expect(Object.prototype.hasOwnProperty.call(sidecar, "entityKind")).toBe(
        false,
      );
      expect(Object.prototype.hasOwnProperty.call(sidecar, "aliases")).toBe(
        false,
      );
      expect(sidecar?.name).toBe("Aria");
      expect(sidecar?.type).toBe("text");
      expect(sidecar?.orderIndex).toBe(2);
      expect(sidecar?.folderId).toBe("folder-9");
      expect(sidecar?.status).toBe("in-progress");

      // FR-21: the entity no longer appears in buildEntityAliasTable's
      // output for the project once entityKind is gone.
      const table = await buildEntityAliasTable(projectPath);
      expect(table.entities[resourceId]).toBeUndefined();
    });
  });

  it("EntitySection's withEntityKind clear-only write leaves entityKind absent while aliases are unchanged", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();
      await mkdir(path.join(projectPath, "resources", resourceId), {
        recursive: true,
      });
      await writeSidecar(projectPath, resourceId, {
        id: resourceId,
        name: "Jones",
        type: "text",
        entityKind: "character",
        aliases: ["JJ"],
        orderIndex: 5,
        folderId: null,
      });

      // Mirrors EntitySection.tsx's withEntityKind clear path: entityKind is
      // cleared via clearKeys, aliases is never included (FR-3).
      const { POST } =
        await import("../../app/api/resource/[resource-id]/sidecar/route");
      const res = await POST(
        sidecarRequest(resourceId, {
          projectId,
          updatedResource: {
            id: resourceId,
            name: "Jones",
            type: "text",
            aliases: ["JJ"],
          },
          clearKeys: ["entityKind"],
        }) as never,
        { params: Promise.resolve({ "resource-id": resourceId }) },
      );

      expect(res.status).toBe(200);
      const sidecar = await readSidecar(projectPath, resourceId);
      expect(sidecar).not.toBeNull();
      expect(Object.prototype.hasOwnProperty.call(sidecar, "entityKind")).toBe(
        false,
      );
      expect(sidecar?.aliases).toEqual(["JJ"]);
      expect(sidecar?.name).toBe("Jones");
      expect(sidecar?.orderIndex).toBe(5);

      // FR-21: absent from buildEntityAliasTable's output once entityKind is
      // gone, even though aliases are still present on disk.
      const table = await buildEntityAliasTable(projectPath);
      expect(table.entities[resourceId]).toBeUndefined();
    });
  });
});
