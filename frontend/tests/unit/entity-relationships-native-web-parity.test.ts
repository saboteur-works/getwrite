/**
 * entity-relationships Task 5: native/web parity for the authored
 * relationship-edge transport (FR-1/FR-4/FR-8/FR-17).
 *
 * Neither the route test (`entity-relationships-route.test.ts`) nor the
 * native-backend test (`native-entity-relationships-backend.test.ts`)
 * asserts that the two transports return the *same* shape for equivalent
 * underlying project data — each only exercises its own side. This test
 * seeds the same fixture project config into both a real temp-dir project
 * (read by the HTTP routes) and a fake Capacitor filesystem (read by
 * `createNativeEntityRelationshipsTransport`), then asserts the two
 * transports produce identical results for list/create/remove, including
 * FR-17 idempotency and FR-4 same-entity rejection. Mirrors
 * `entity-cooccurrence-native-web-parity.test.ts`.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import {
  GET,
  POST,
} from "../../app/api/project/[project-id]/entity-relationships/route";
import { POST as REMOVE } from "../../app/api/project/[project-id]/entity-relationships/remove/route";
import type { EntityRelationshipEdge } from "../../src/lib/models/entity-relationships";
import { generateUUID } from "../../src/lib/models/uuid";
import { removeDirRetry } from "./helpers/fs-utils";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import { createNativeEntityRelationshipsTransport } from "../../src/store/transport/native-entity-relationships-backend";

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

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

function makeGetRequest(projectId: string): NextRequest {
  const url = new URL(
    `http://localhost/api/project/${projectId}/entity-relationships`,
  );
  return new NextRequest(url.toString());
}

function makePostRequest(
  projectId: string,
  body: Record<string, unknown>,
): NextRequest {
  const url = new URL(
    `http://localhost/api/project/${projectId}/entity-relationships`,
  );
  return new NextRequest(url.toString(), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function makeRemoveRequest(
  projectId: string,
  body: Record<string, unknown>,
): NextRequest {
  const url = new URL(
    `http://localhost/api/project/${projectId}/entity-relationships/remove`,
  );
  return new NextRequest(url.toString(), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** Sets up a real temp-dir project with a `config.relationshipTypes` list. */
async function setupHttpProject(
  relationshipTypes: string[],
): Promise<{ projectsDir: string; projectId: string }> {
  const projectsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-entity-relationships-parity-"),
  );
  tmpDirs.push(projectsDir);
  const projectId = generateUUID();
  const projectPath = path.join(projectsDir, projectId);
  await fs.mkdir(projectPath, { recursive: true });
  await fs.writeFile(
    path.join(projectPath, "project.json"),
    JSON.stringify({ config: { relationshipTypes } }, null, 2),
    "utf8",
  );
  return { projectsDir, projectId };
}

/** Sets up a fake Capacitor filesystem project with the same config shape. */
async function setupNativeProject(
  relationshipTypes: string[],
): Promise<{
  nativeFs: ReturnType<typeof createFakeCapacitorFilesystem>;
  projectsDir: string;
  projectId: string;
}> {
  const projectsDir = "/projects";
  const nativeFs = createFakeCapacitorFilesystem();
  const adapter = capacitorFsAdapter(nativeFs);
  const projectId = generateUUID();
  const projectPath = path.join(projectsDir, projectId);
  await adapter.mkdir(projectPath, { recursive: true });
  await adapter.writeFile(
    path.join(projectPath, "project.json"),
    JSON.stringify({ config: { relationshipTypes } }, null, 2),
  );
  return { nativeFs, projectsDir, projectId };
}

describe("entity relationships — native/web parity (FR-1/FR-4/FR-8/FR-17)", () => {
  it("list/create/remove produce identical results on both transports for the same fixture inputs", async () => {
    const sourceId = generateUUID();
    const targetId = generateUUID();

    const { projectsDir, projectId: httpProjectId } = await setupHttpProject([
      "ally",
    ]);
    const {
      nativeFs,
      projectsDir: nativeProjectsDir,
      projectId: nativeProjectId,
    } = await setupNativeProject(["ally"]);
    const nativeTransport = createNativeEntityRelationshipsTransport({
      fs: nativeFs,
      projectsDir: nativeProjectsDir,
    });

    // Empty list before anything is created.
    const httpEmptyList = await withProjectsDirEnv(projectsDir, async () => {
      const res = await GET(makeGetRequest(httpProjectId), {
        params: Promise.resolve({ "project-id": httpProjectId }),
      });
      expect(res.status).toBe(200);
      return (await res.json()) as EntityRelationshipEdge[];
    });
    const nativeEmptyList = await nativeTransport.list(nativeProjectId);
    expect(httpEmptyList).toEqual([]);
    expect(nativeEmptyList).toEqual([]);

    // Create the same edge on both transports.
    const httpCreated = await withProjectsDirEnv(projectsDir, async () => {
      const res = await POST(
        makePostRequest(httpProjectId, {
          sourceEntityId: sourceId,
          targetEntityId: targetId,
          relationshipType: "ally",
        }),
        { params: Promise.resolve({ "project-id": httpProjectId }) },
      );
      expect(res.status).toBe(201);
      return (await res.json()) as EntityRelationshipEdge;
    });
    const nativeCreated = await nativeTransport.create(
      nativeProjectId,
      sourceId,
      targetId,
      "ally",
    );

    expect(nativeCreated).not.toBeNull();
    expect({
      sourceEntityId: httpCreated.sourceEntityId,
      targetEntityId: httpCreated.targetEntityId,
      relationshipType: httpCreated.relationshipType,
    }).toEqual({
      sourceEntityId: nativeCreated!.sourceEntityId,
      targetEntityId: nativeCreated!.targetEntityId,
      relationshipType: nativeCreated!.relationshipType,
    });

    // FR-17: creating the identical triple again is a no-op on both sides.
    const httpSecondCreate = await withProjectsDirEnv(projectsDir, async () => {
      const res = await POST(
        makePostRequest(httpProjectId, {
          sourceEntityId: sourceId,
          targetEntityId: targetId,
          relationshipType: "ally",
        }),
        { params: Promise.resolve({ "project-id": httpProjectId }) },
      );
      expect(res.status).toBe(201);
      return (await res.json()) as EntityRelationshipEdge;
    });
    const nativeSecondCreate = await nativeTransport.create(
      nativeProjectId,
      sourceId,
      targetId,
      "ally",
    );
    expect(httpSecondCreate.id).toBe(httpCreated.id);
    expect(nativeSecondCreate?.id).toBe(nativeCreated!.id);

    const httpListAfterCreate = await withProjectsDirEnv(
      projectsDir,
      async () => {
        const res = await GET(makeGetRequest(httpProjectId), {
          params: Promise.resolve({ "project-id": httpProjectId }),
        });
        return (await res.json()) as EntityRelationshipEdge[];
      },
    );
    const nativeListAfterCreate = await nativeTransport.list(nativeProjectId);
    expect(httpListAfterCreate).toHaveLength(1);
    expect(nativeListAfterCreate).toHaveLength(1);

    // FR-4: same source/target is rejected on both transports.
    const httpSameEntity = await withProjectsDirEnv(projectsDir, async () => {
      const res = await POST(
        makePostRequest(httpProjectId, {
          sourceEntityId: sourceId,
          targetEntityId: sourceId,
          relationshipType: "ally",
        }),
        { params: Promise.resolve({ "project-id": httpProjectId }) },
      );
      return res.status;
    });
    const nativeSameEntity = await nativeTransport.create(
      nativeProjectId,
      sourceId,
      sourceId,
      "ally",
    );
    expect(httpSameEntity).toBe(400);
    expect(nativeSameEntity).toBeNull();

    // Remove the created edge on both transports.
    const didRemoveHttp = await withProjectsDirEnv(projectsDir, async () => {
      const res = await REMOVE(
        makeRemoveRequest(httpProjectId, { edgeId: httpCreated.id }),
        { params: Promise.resolve({ "project-id": httpProjectId }) },
      );
      const body = (await res.json()) as { removed: boolean };
      return body.removed;
    });
    const didRemoveNative = await nativeTransport.remove(
      nativeProjectId,
      nativeCreated!.id,
    );
    expect(didRemoveHttp).toBe(true);
    expect(didRemoveNative).toBe(true);

    const httpListAfterRemove = await withProjectsDirEnv(
      projectsDir,
      async () => {
        const res = await GET(makeGetRequest(httpProjectId), {
          params: Promise.resolve({ "project-id": httpProjectId }),
        });
        return (await res.json()) as EntityRelationshipEdge[];
      },
    );
    const nativeListAfterRemove = await nativeTransport.list(nativeProjectId);
    expect(httpListAfterRemove).toEqual([]);
    expect(nativeListAfterRemove).toEqual([]);
  });

  it("rejects a relationshipType outside the project's configured list identically on both transports (FR-15)", async () => {
    const sourceId = generateUUID();
    const targetId = generateUUID();

    const { projectsDir, projectId: httpProjectId } = await setupHttpProject([
      "ally",
    ]);
    const {
      nativeFs,
      projectsDir: nativeProjectsDir,
      projectId: nativeProjectId,
    } = await setupNativeProject(["ally"]);
    const nativeTransport = createNativeEntityRelationshipsTransport({
      fs: nativeFs,
      projectsDir: nativeProjectsDir,
    });

    const httpStatus = await withProjectsDirEnv(projectsDir, async () => {
      const res = await POST(
        makePostRequest(httpProjectId, {
          sourceEntityId: sourceId,
          targetEntityId: targetId,
          relationshipType: "not-a-real-type",
        }),
        { params: Promise.resolve({ "project-id": httpProjectId }) },
      );
      return res.status;
    });
    const nativeResult = await nativeTransport.create(
      nativeProjectId,
      sourceId,
      targetId,
      "not-a-real-type",
    );

    expect(httpStatus).toBe(400);
    expect(nativeResult).toBeNull();
  });
});
