/**
 * remove-entity Task 11: native/web parity for `updateSidecarCore`'s
 * `clearKeys` parameter (FR-20).
 *
 * Neither the route test (`resource-sidecar-route.test.ts`) nor the
 * native-backend test (`native-resource-backend.test.ts`) asserts that the
 * two transports produce the *same* on-disk sidecar shape for equivalent
 * inputs — each only exercises its own side. This test drives the sidecar
 * route's `POST` handler against a real temp-dir project (HTTP) and
 * `createNativeResourcesTransport` against a fake Capacitor filesystem
 * (native) with the same seeded sidecar, the same `updatedResource`, and the
 * same `clearKeys`, then compares which keys are present/absent in the
 * resulting persisted sidecar. Mirrors
 * `entity-relationships-native-web-parity.test.ts`.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { generateUUID } from "../../src/lib/models/uuid";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import { removeDirRetry } from "./helpers/fs-utils";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import { createNativeResourcesTransport } from "../../src/store/transport/native-resource-backend";
import { sidecarPathForProject } from "../../src/lib/models/sidecar";

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

function sidecarRequest(resourceId: string, body: unknown): Request {
  return new Request(`http://localhost/api/resource/${resourceId}/sidecar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

/** Sets up a real temp-dir project with a seeded sidecar for `resourceId`. */
async function setupHttpProject(
  resourceId: string,
): Promise<{ projectsDir: string; projectId: string; projectPath: string }> {
  const projectsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-resources-parity-"),
  );
  tmpDirs.push(projectsDir);
  const projectId = generateUUID();
  const projectPath = path.join(projectsDir, projectId);
  await fs.mkdir(projectPath, { recursive: true });
  await writeSidecar(projectPath, resourceId, {
    id: resourceId,
    name: "Original",
    type: "text",
    entityKind: "character",
    aliases: ["Al"],
    orderIndex: 3,
    folderId: "folder-1",
  });
  return { projectsDir, projectId, projectPath };
}

/** Sets up a fake Capacitor filesystem project with the same seeded sidecar. */
async function setupNativeProject(
  resourceId: string,
): Promise<{
  nativeFs: ReturnType<typeof createFakeCapacitorFilesystem>;
  projectsDir: string;
  projectId: string;
  projectPath: string;
}> {
  const projectsDir = "/projects";
  const nativeFs = createFakeCapacitorFilesystem();
  const adapter = capacitorFsAdapter(nativeFs);
  const projectId = generateUUID();
  const projectPath = path.join(projectsDir, projectId);
  await adapter.mkdir(projectPath, { recursive: true });
  await adapter.writeFile(
    path.join(projectPath, "project.json"),
    JSON.stringify({ id: projectId, name: "Native Project" }, null, 2),
  );
  await adapter.mkdir(path.join(projectPath, "meta"), { recursive: true });
  await adapter.writeFile(
    sidecarPathForProject(projectPath, resourceId),
    JSON.stringify(
      {
        id: resourceId,
        name: "Original",
        type: "text",
        entityKind: "character",
        aliases: ["Al"],
        orderIndex: 3,
        folderId: "folder-1",
      },
      null,
      2,
    ),
  );
  return { nativeFs, projectsDir, projectId, projectPath };
}

describe("resource sidecar clearKeys — native/web parity (FR-20)", () => {
  it("deletes the same keys from the persisted sidecar on both transports for the same inputs", async () => {
    const resourceId = generateUUID();

    const {
      projectsDir,
      projectId: httpProjectId,
      projectPath,
    } = await setupHttpProject(resourceId);
    const {
      nativeFs,
      projectsDir: nativeProjectsDir,
      projectId: nativeProjectId,
      projectPath: nativeProjectPath,
    } = await setupNativeProject(resourceId);
    const nativeTransport = createNativeResourcesTransport({
      fs: nativeFs,
      projectsDir: nativeProjectsDir,
    });

    await withProjectsDirEnv(projectsDir, async () => {
      const { POST } =
        await import("../../app/api/resource/[resource-id]/sidecar/route");
      const res = await POST(
        sidecarRequest(resourceId, {
          projectId: httpProjectId,
          updatedResource: {},
          clearKeys: ["entityKind", "aliases"],
        }) as never,
        { params: Promise.resolve({ "resource-id": resourceId }) },
      );
      expect(res.status).toBe(200);
    });

    await nativeTransport.updateSidecar(
      resourceId,
      nativeProjectId,
      {} as never,
      ["entityKind", "aliases"],
    );

    const httpSidecar = await readSidecar(projectPath, resourceId);
    const adapter = capacitorFsAdapter(nativeFs);
    const rawNativeSidecar = await adapter.readFile(
      sidecarPathForProject(nativeProjectPath, resourceId),
      "utf-8",
    );
    const nativeSidecar = JSON.parse(rawNativeSidecar as string) as Record<
      string,
      unknown
    >;

    expect(httpSidecar).not.toBeNull();

    // Same keys present/absent on both sides — genuinely absent, not
    // undefined-valued.
    expect(
      Object.prototype.hasOwnProperty.call(httpSidecar, "entityKind"),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(nativeSidecar, "entityKind"),
    ).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(httpSidecar, "aliases")).toBe(
      false,
    );
    expect(Object.prototype.hasOwnProperty.call(nativeSidecar, "aliases")).toBe(
      false,
    );

    // Everything else, including the orderIndex/folderId carve-out, matches.
    expect(httpSidecar?.name).toBe(nativeSidecar.name);
    expect(httpSidecar?.type).toBe(nativeSidecar.type);
    expect(httpSidecar?.orderIndex).toBe(nativeSidecar.orderIndex);
    expect(httpSidecar?.folderId).toBe(nativeSidecar.folderId);
  });
});
