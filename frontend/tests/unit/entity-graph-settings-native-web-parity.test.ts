/**
 * Feature 68 Task 6: native/web parity for the entity-graph settings
 * transport (FR-7/FR-8/FR-21).
 *
 * Neither the route test (`entity-graph-settings-route.test.ts`) nor the
 * transport test (`entity-graph-settings-transport.test.ts`) asserts that
 * the two transports return the *same* shape for equivalent underlying
 * project data — each only exercises its own side. This test seeds the same
 * fixture project config into both a real temp-dir project (read by the HTTP
 * route) and a fake Capacitor filesystem (read by
 * `createNativeEntityGraphSettingsTransport`), then asserts the two
 * transports produce identical results for get/set, including the
 * default-fallback and unrecognized-connection-type-filtering behavior.
 * Mirrors `entity-relationships-native-web-parity.test.ts`.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET, PUT } from "../../app/api/project/entity-graph-settings/route";
import { generateUUID } from "../../src/lib/models/uuid";
import { removeDirRetry } from "./helpers/fs-utils";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import { createNativeEntityGraphSettingsTransport } from "../../src/store/transport/native-entity-graph-settings-backend";

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
    `http://localhost/api/project/entity-graph-settings?projectId=${projectId}`,
  );
  return new NextRequest(url.toString());
}

function makePutRequest(
  projectId: string,
  body: Record<string, unknown>,
): NextRequest {
  const url = new URL("http://localhost/api/project/entity-graph-settings");
  return new NextRequest(url.toString(), {
    method: "PUT",
    body: JSON.stringify({ projectId, ...body }),
    headers: { "content-type": "application/json" },
  });
}

/** Sets up a real temp-dir project with the given `config` fields. */
async function setupHttpProject(
  config: Record<string, unknown>,
): Promise<{ projectsDir: string; projectId: string }> {
  const projectsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-entity-graph-settings-parity-"),
  );
  tmpDirs.push(projectsDir);
  const projectId = generateUUID();
  const projectPath = path.join(projectsDir, projectId);
  await fs.mkdir(projectPath, { recursive: true });
  await fs.writeFile(
    path.join(projectPath, "project.json"),
    JSON.stringify({ config }, null, 2),
    "utf8",
  );
  return { projectsDir, projectId };
}

/** Sets up a fake Capacitor filesystem project with the same config shape. */
async function setupNativeProject(
  config: Record<string, unknown>,
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
    JSON.stringify({ config }, null, 2),
  );
  return { nativeFs, projectsDir, projectId };
}

describe("entity graph settings — native/web parity (FR-7/FR-8/FR-21)", () => {
  it("get returns identical defaults on both transports for a project with nothing persisted", async () => {
    const { projectsDir, projectId: httpProjectId } = await setupHttpProject(
      {},
    );
    const {
      nativeFs,
      projectsDir: nativeProjectsDir,
      projectId: nativeProjectId,
    } = await setupNativeProject({});
    const nativeTransport = createNativeEntityGraphSettingsTransport({
      fs: nativeFs,
      projectsDir: nativeProjectsDir,
    });

    const httpSettings = await withProjectsDirEnv(projectsDir, async () => {
      const res = await GET(makeGetRequest(httpProjectId));
      expect(res.status).toBe(200);
      return res.json();
    });
    const nativeSettings =
      await nativeTransport.getEntityGraphSettings(nativeProjectId);

    expect(httpSettings).toEqual(nativeSettings);
  });

  it("set then get produce identical results on both transports for the same fixture inputs", async () => {
    const { projectsDir, projectId: httpProjectId } = await setupHttpProject(
      {},
    );
    const {
      nativeFs,
      projectsDir: nativeProjectsDir,
      projectId: nativeProjectId,
    } = await setupNativeProject({});
    const nativeTransport = createNativeEntityGraphSettingsTransport({
      fs: nativeFs,
      projectsDir: nativeProjectsDir,
    });

    const httpSet = await withProjectsDirEnv(projectsDir, async () => {
      const res = await PUT(
        makePutRequest(httpProjectId, {
          entityGraphConnectionTypes: ["authored", "backlinks"],
          entityGraphFocalHopRadius: 2,
        }),
      );
      expect(res.status).toBe(200);
      return res.json();
    });
    const nativeSet = await nativeTransport.setEntityGraphSettings(
      nativeProjectId,
      ["authored", "backlinks"],
      2,
    );
    expect(httpSet).toEqual(nativeSet);

    const httpGet = await withProjectsDirEnv(projectsDir, async () => {
      const res = await GET(makeGetRequest(httpProjectId));
      return res.json();
    });
    const nativeGet =
      await nativeTransport.getEntityGraphSettings(nativeProjectId);
    expect(httpGet).toEqual(nativeGet);
    expect(httpGet).toEqual({
      entityGraphConnectionTypes: ["authored", "backlinks"],
      entityGraphFocalHopRadius: 2,
    });
  });

  it("filters an unrecognized connection-type key identically on both transports (FR-2)", async () => {
    const { projectsDir, projectId: httpProjectId } = await setupHttpProject(
      {},
    );
    const {
      nativeFs,
      projectsDir: nativeProjectsDir,
      projectId: nativeProjectId,
    } = await setupNativeProject({});
    const nativeTransport = createNativeEntityGraphSettingsTransport({
      fs: nativeFs,
      projectsDir: nativeProjectsDir,
    });

    const httpResult = await withProjectsDirEnv(projectsDir, async () => {
      const res = await PUT(
        makePutRequest(httpProjectId, {
          entityGraphConnectionTypes: ["authored", "not-a-real-type"],
          entityGraphFocalHopRadius: 1,
        }),
      );
      expect(res.status).toBe(200);
      return res.json();
    });
    const nativeResult = await nativeTransport.setEntityGraphSettings(
      nativeProjectId,
      ["authored", "not-a-real-type"],
      1,
    );

    expect(httpResult).toEqual(nativeResult);
    expect(httpResult).toEqual({
      entityGraphConnectionTypes: ["authored"],
      entityGraphFocalHopRadius: 1,
    });
  });

  it("rejects an invalid hop radius identically on both transports", async () => {
    const { projectsDir, projectId: httpProjectId } = await setupHttpProject(
      {},
    );
    const {
      nativeFs,
      projectsDir: nativeProjectsDir,
      projectId: nativeProjectId,
    } = await setupNativeProject({});
    const nativeTransport = createNativeEntityGraphSettingsTransport({
      fs: nativeFs,
      projectsDir: nativeProjectsDir,
    });

    const httpStatus = await withProjectsDirEnv(projectsDir, async () => {
      const res = await PUT(
        makePutRequest(httpProjectId, {
          entityGraphConnectionTypes: ["authored"],
          entityGraphFocalHopRadius: -1,
        }),
      );
      return res.status;
    });
    expect(httpStatus).toBe(400);

    await expect(
      nativeTransport.setEntityGraphSettings(nativeProjectId, ["authored"], -1),
    ).rejects.toThrow();
  });
});
