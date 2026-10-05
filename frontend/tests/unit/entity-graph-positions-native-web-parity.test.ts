/**
 * Feature 68 Task 12: native/web parity for the entity-graph node position
 * persistence transport (FR-9/FR-10).
 *
 * Mirrors `entity-graph-settings-native-web-parity.test.ts`: seeds the same
 * fixture project into both a real temp-dir project (read by the HTTP route)
 * and a fake Capacitor filesystem (read by
 * `createNativeEntityGraphPositionsTransport`), then asserts the two
 * transports produce identical results for get/save, including the
 * invalid-projectId failure case.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET, PUT } from "../../app/api/project/entity-graph-positions/route";
import { generateUUID } from "../../src/lib/models/uuid";
import { removeDirRetry } from "./helpers/fs-utils";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import { createNativeEntityGraphPositionsTransport } from "../../src/store/transport/native-entity-graph-positions-backend";

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
    `http://localhost/api/project/entity-graph-positions?projectId=${projectId}`,
  );
  return new NextRequest(url.toString());
}

function makePutRequest(
  projectId: string,
  body: Record<string, unknown>,
): NextRequest {
  const url = new URL("http://localhost/api/project/entity-graph-positions");
  return new NextRequest(url.toString(), {
    method: "PUT",
    body: JSON.stringify({ projectId, ...body }),
    headers: { "content-type": "application/json" },
  });
}

/** Sets up a real, empty temp-dir project. */
async function setupHttpProject(): Promise<{
  projectsDir: string;
  projectId: string;
}> {
  const projectsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-entity-graph-positions-parity-"),
  );
  tmpDirs.push(projectsDir);
  const projectId = generateUUID();
  const projectPath = path.join(projectsDir, projectId);
  await fs.mkdir(projectPath, { recursive: true });
  await fs.writeFile(
    path.join(projectPath, "project.json"),
    JSON.stringify({ config: {} }, null, 2),
    "utf8",
  );
  return { projectsDir, projectId };
}

/** Sets up a fake Capacitor filesystem project with the same shape. */
async function setupNativeProject(): Promise<{
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
    JSON.stringify({ config: {} }, null, 2),
  );
  return { nativeFs, projectsDir, projectId };
}

describe("entity graph positions — native/web parity (FR-9/FR-10)", () => {
  it("get returns an identical empty list on both transports for a project with no positions saved", async () => {
    const { projectsDir, projectId: httpProjectId } = await setupHttpProject();
    const {
      nativeFs,
      projectsDir: nativeProjectsDir,
      projectId: nativeProjectId,
    } = await setupNativeProject();
    const nativeTransport = createNativeEntityGraphPositionsTransport({
      fs: nativeFs,
      projectsDir: nativeProjectsDir,
    });

    const httpPositions = await withProjectsDirEnv(projectsDir, async () => {
      const res = await GET(makeGetRequest(httpProjectId));
      expect(res.status).toBe(200);
      return res.json();
    });
    const nativePositions =
      await nativeTransport.getEntityGraphPositions(nativeProjectId);

    expect(httpPositions).toEqual(nativePositions);
    expect(httpPositions).toEqual([]);
  });

  it("save then get produce identical results on both transports for the same fixture inputs", async () => {
    const { projectsDir, projectId: httpProjectId } = await setupHttpProject();
    const {
      nativeFs,
      projectsDir: nativeProjectsDir,
      projectId: nativeProjectId,
    } = await setupNativeProject();
    const nativeTransport = createNativeEntityGraphPositionsTransport({
      fs: nativeFs,
      projectsDir: nativeProjectsDir,
    });

    const positionBody = {
      entityId: "entity-1",
      x: 12.5,
      y: -4,
      connectionTypesSnapshot: ["authored", "backlinks"],
    };

    const httpSaved = await withProjectsDirEnv(projectsDir, async () => {
      const res = await PUT(makePutRequest(httpProjectId, positionBody));
      expect(res.status).toBe(200);
      return res.json();
    });
    const nativeSaved = await nativeTransport.saveEntityGraphPosition(
      nativeProjectId,
      positionBody.entityId,
      positionBody.x,
      positionBody.y,
      positionBody.connectionTypesSnapshot,
    );

    // `savedAt` is a real timestamp assigned independently by each transport,
    // so compare everything else field-for-field and only assert `savedAt`
    // is present and well-formed on both sides.
    expect(typeof httpSaved.savedAt).toBe("string");
    expect(typeof nativeSaved.savedAt).toBe("string");
    expect({ ...httpSaved, savedAt: undefined }).toEqual({
      ...nativeSaved,
      savedAt: undefined,
    });
    expect({ ...httpSaved, savedAt: undefined }).toEqual({
      entityId: "entity-1",
      x: 12.5,
      y: -4,
      connectionTypesSnapshot: ["authored", "backlinks"],
      savedAt: undefined,
    });

    const httpList = await withProjectsDirEnv(projectsDir, async () => {
      const res = await GET(makeGetRequest(httpProjectId));
      return res.json();
    });
    const nativeList =
      await nativeTransport.getEntityGraphPositions(nativeProjectId);

    expect(httpList).toHaveLength(1);
    expect(nativeList).toHaveLength(1);
    expect({ ...httpList[0], savedAt: undefined }).toEqual({
      ...nativeList[0],
      savedAt: undefined,
    });
  });

  it("rejects an invalid projectId identically on both transports", async () => {
    const nativeTransport = createNativeEntityGraphPositionsTransport({
      fs: createFakeCapacitorFilesystem(),
      projectsDir: "/projects",
    });

    const res = await GET(makeGetRequest("not-a-uuid"));
    expect(res.status).toBe(400);

    await expect(
      nativeTransport.getEntityGraphPositions("not-a-uuid"),
    ).rejects.toThrow();
  });
});
