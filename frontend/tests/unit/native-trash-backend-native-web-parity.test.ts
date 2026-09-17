/**
 * native-trash-transport Task 8: native/web parity for the Trash transport
 * (FR-1/FR-2/FR-11/FR-12/FR-18, plus the FR-8/FR-9/FR-10 failure taxonomy
 * `native-trash-backend.ts` implements).
 *
 * Neither the route tests (`tests/integration/trash-routes.test.ts`) nor a
 * hypothetical native-backend-only test assert that the two transports
 * return *equivalent* results for the same underlying project data — each
 * only exercises its own side. This test seeds identical fixtures into a
 * real temp-dir project (read by the HTTP routes) and a fake Capacitor
 * filesystem (read by `createNativeTrashTransport`), then asserts list,
 * restore, and purge — including a mixed-outcome batch and a mid-sweep
 * `PurgeSweepError` — produce the same shape of result on both transports.
 * Mirrors `entity-relationships-native-web-parity.test.ts`'s structure.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { generateUUID } from "../../src/lib/models/uuid";
import { createTextResource } from "../../src/lib/models/resource-factory";
import { writeResourceToFile } from "../../src/lib/models/resource-persistence";
import {
  PurgeSweepError,
  purgeResourceSteps,
  softDeleteResource,
} from "../../src/lib/models/trash";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import {
  runInStorageContext,
  setDefaultStorageContext,
  __resetDefaultStorageContextForTests,
} from "../../src/lib/models/storage-context";
import { createNativeTrashTransport } from "../../src/store/transport/native-trash-backend";
import { removeDirRetry } from "./helpers/fs-utils";
import type {
  PurgeItemResult,
  RestoreItemResult,
  TrashListing,
} from "../../src/lib/api/trash";

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
  __resetDefaultStorageContextForTests();
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

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Sets up a real temp-dir project for the HTTP routes to operate against. */
async function setupHttpProject(): Promise<{
  projectsDir: string;
  projectId: string;
  projectPath: string;
}> {
  const projectsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-trash-parity-"),
  );
  tmpDirs.push(projectsDir);
  const projectId = generateUUID();
  const projectPath = path.join(projectsDir, projectId);
  await fs.mkdir(projectPath, { recursive: true });
  return { projectsDir, projectId, projectPath };
}

/**
 * Seeds a text resource, writes it, and soft-deletes it, against the
 * currently-ambient storage adapter (real fs for the HTTP side — no storage
 * context is bound there, so `io.ts` falls back to its default adapter).
 */
async function seedHttpTrashedResource(
  projectPath: string,
  name: string,
  plainText: string,
): Promise<string> {
  const resource = createTextResource({ name, plainText });
  await writeResourceToFile(projectPath, resource);
  await softDeleteResource(projectPath, resource.id);
  return resource.id;
}

/**
 * Sets up a fake-Capacitor-filesystem-backed project for the native side.
 *
 * Also installs this project's `{ tenantRoot, adapter }` as the process-wide
 * default `StorageContext` (`setDefaultStorageContext`) — the same mechanism
 * a real native bootstrap installs once at app startup. This matters because
 * `native-trash-backend.ts`'s `restore`/`purge` resolve `projectId` ->
 * project root via `resolveProjectRoot()` *before* entering their own
 * `run()`'s one-off `runInStorageContext` scope (deliberately, so an invalid
 * id rejects the whole call before any per-id work starts) — so at the
 * moment of that resolution there is no ambient `AsyncLocalStorage` scope
 * yet, and `resolveProjectsDir()` falls through to whatever default context
 * is installed, exactly as it would in production once
 * `ensureNativeStorageContext()` has run. Reset in `afterEach` via
 * `__resetDefaultStorageContextForTests()` to avoid cross-test bleed.
 */
async function setupNativeProject(): Promise<{
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
    JSON.stringify({ config: {} }, null, 2),
  );
  setDefaultStorageContext({ tenantRoot: projectsDir, adapter });
  return { nativeFs, projectsDir, projectId, projectPath };
}

/**
 * Seeds a text resource, writes it, and soft-deletes it, against the native
 * fake filesystem — bound as the ambient storage context for the duration
 * of the seeding call, exactly as `native-runner.ts`'s own `run()` binds it
 * for the transport's own operations.
 */
async function seedNativeTrashedResource(
  nativeFs: ReturnType<typeof createFakeCapacitorFilesystem>,
  projectsDir: string,
  projectPath: string,
  name: string,
  plainText: string,
): Promise<string> {
  const adapter = capacitorFsAdapter(nativeFs);
  return runInStorageContext({ tenantRoot: projectsDir, adapter }, async () => {
    const resource = createTextResource({ name, plainText });
    await writeResourceToFile(projectPath, resource);
    await softDeleteResource(projectPath, resource.id);
    return resource.id;
  });
}

async function httpList(
  projectsDir: string,
  projectId: string,
): Promise<TrashListing> {
  return withProjectsDirEnv(projectsDir, async () => {
    const { GET } =
      await import("../../app/api/project/[project-id]/trash/route");
    const res = await GET(
      new Request(`http://localhost/api/project/${projectId}/trash`) as never,
      { params: Promise.resolve({ "project-id": projectId }) },
    );
    expect(res.status).toBe(200);
    return (await res.json()) as TrashListing;
  });
}

async function httpRestore(
  projectsDir: string,
  projectId: string,
  ids: string[],
): Promise<RestoreItemResult[]> {
  return withProjectsDirEnv(projectsDir, async () => {
    const { POST } =
      await import("../../app/api/project/[project-id]/trash/restore/route");
    const res = await POST(
      jsonRequest(`http://localhost/api/project/${projectId}/trash/restore`, {
        ids,
      }) as never,
      { params: Promise.resolve({ "project-id": projectId }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: RestoreItemResult[] };
    return body.results;
  });
}

async function httpPurge(
  projectsDir: string,
  projectId: string,
  ids: string[],
): Promise<PurgeItemResult[]> {
  return withProjectsDirEnv(projectsDir, async () => {
    const { POST } =
      await import("../../app/api/project/[project-id]/trash/purge/route");
    const res = await POST(
      jsonRequest(`http://localhost/api/project/${projectId}/trash/purge`, {
        ids,
      }) as never,
      { params: Promise.resolve({ "project-id": projectId }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: PurgeItemResult[] };
    return body.results;
  });
}

describe("native trash transport — native/web parity", () => {
  it("list/restore produce equivalent results on both transports for identical fixtures", async () => {
    const {
      projectsDir,
      projectId: httpProjectId,
      projectPath: httpProjectPath,
    } = await setupHttpProject();
    const {
      nativeFs,
      projectsDir: nativeProjectsDir,
      projectId: nativeProjectId,
      projectPath: nativeProjectPath,
    } = await setupNativeProject();
    const nativeTransport = createNativeTrashTransport({
      fs: nativeFs,
      projectsDir: nativeProjectsDir,
    });

    // Empty listing before anything is trashed.
    const httpEmpty = await httpList(projectsDir, httpProjectId);
    const nativeEmpty = await nativeTransport.list(nativeProjectId);
    expect(httpEmpty).toEqual({ resources: [], folders: [] });
    expect(nativeEmpty).toEqual({ resources: [], folders: [] });

    // Seed one equivalent trashed resource on each side.
    const httpResourceId = await withProjectsDirEnv(projectsDir, () =>
      seedHttpTrashedResource(httpProjectPath, "Draft", "content"),
    );
    const nativeResourceId = await seedNativeTrashedResource(
      nativeFs,
      nativeProjectsDir,
      nativeProjectPath,
      "Draft",
      "content",
    );

    const httpListed = await httpList(projectsDir, httpProjectId);
    const nativeListed = await nativeTransport.list(nativeProjectId);
    expect(httpListed.resources).toHaveLength(1);
    expect(nativeListed.resources).toHaveLength(1);
    expect(httpListed.resources[0]?.originalName).toBe("Draft");
    expect(nativeListed.resources[0]?.originalName).toBe("Draft");
    expect(httpListed.folders).toEqual([]);
    expect(nativeListed.folders).toEqual([]);

    // Restore produces an equivalent shape on both sides.
    const httpRestored = await httpRestore(projectsDir, httpProjectId, [
      httpResourceId,
    ]);
    const nativeRestored = await nativeTransport.restore(nativeProjectId, [
      nativeResourceId,
    ]);
    expect(httpRestored).toHaveLength(1);
    expect(nativeRestored).toHaveLength(1);
    expect(httpRestored[0]?.ok).toBe(true);
    expect(nativeRestored[0]?.ok).toBe(true);

    const httpAfterRestore = await httpList(projectsDir, httpProjectId);
    const nativeAfterRestore = await nativeTransport.list(nativeProjectId);
    expect(httpAfterRestore.resources).toEqual([]);
    expect(nativeAfterRestore.resources).toEqual([]);
  });

  it("reports a mixed-outcome restore batch identically on both transports (one valid id, one not in trash)", async () => {
    const {
      projectsDir,
      projectId: httpProjectId,
      projectPath: httpProjectPath,
    } = await setupHttpProject();
    const {
      nativeFs,
      projectsDir: nativeProjectsDir,
      projectId: nativeProjectId,
      projectPath: nativeProjectPath,
    } = await setupNativeProject();
    const nativeTransport = createNativeTrashTransport({
      fs: nativeFs,
      projectsDir: nativeProjectsDir,
    });

    const httpResourceId = await withProjectsDirEnv(projectsDir, () =>
      seedHttpTrashedResource(httpProjectPath, "Real Draft", "content"),
    );
    const nativeResourceId = await seedNativeTrashedResource(
      nativeFs,
      nativeProjectsDir,
      nativeProjectPath,
      "Real Draft",
      "content",
    );

    const missingId = "does-not-exist";

    const httpResults = await httpRestore(projectsDir, httpProjectId, [
      httpResourceId,
      missingId,
    ]);
    const nativeResults = await nativeTransport.restore(nativeProjectId, [
      nativeResourceId,
      missingId,
    ]);

    expect(httpResults).toHaveLength(2);
    expect(nativeResults).toHaveLength(2);

    const httpOk = httpResults.find((r) => r.id === httpResourceId);
    const nativeOk = nativeResults.find((r) => r.id === nativeResourceId);
    expect(httpOk?.ok).toBe(true);
    expect(nativeOk?.ok).toBe(true);

    const httpFailed = httpResults.find((r) => r.id === missingId);
    const nativeFailed = nativeResults.find((r) => r.id === missingId);
    expect(httpFailed?.ok).toBe(false);
    expect(nativeFailed?.ok).toBe(false);
    expect(httpFailed?.error).toBeTruthy();
    expect(nativeFailed?.error).toBeTruthy();
  });

  it("reports a mixed-outcome purge batch identically on both transports (one valid id, one not in trash)", async () => {
    const {
      projectsDir,
      projectId: httpProjectId,
      projectPath: httpProjectPath,
    } = await setupHttpProject();
    const {
      nativeFs,
      projectsDir: nativeProjectsDir,
      projectId: nativeProjectId,
      projectPath: nativeProjectPath,
    } = await setupNativeProject();
    const nativeTransport = createNativeTrashTransport({
      fs: nativeFs,
      projectsDir: nativeProjectsDir,
    });

    const httpResourceId = await withProjectsDirEnv(projectsDir, () =>
      seedHttpTrashedResource(httpProjectPath, "Gone Draft", "content"),
    );
    const nativeResourceId = await seedNativeTrashedResource(
      nativeFs,
      nativeProjectsDir,
      nativeProjectPath,
      "Gone Draft",
      "content",
    );

    const missingId = "does-not-exist";

    const httpResults = await httpPurge(projectsDir, httpProjectId, [
      httpResourceId,
      missingId,
    ]);
    const nativeResults = await nativeTransport.purge(nativeProjectId, [
      nativeResourceId,
      missingId,
    ]);

    expect(httpResults).toHaveLength(2);
    expect(nativeResults).toHaveLength(2);

    const httpOk = httpResults.find((r) => r.id === httpResourceId);
    const nativeOk = nativeResults.find((r) => r.id === nativeResourceId);
    expect(httpOk?.ok).toBe(true);
    expect(nativeOk?.ok).toBe(true);

    const httpFailed = httpResults.find((r) => r.id === missingId);
    const nativeFailed = nativeResults.find((r) => r.id === missingId);
    expect(httpFailed?.ok).toBe(false);
    expect(nativeFailed?.ok).toBe(false);
    expect(httpFailed?.error).toBeTruthy();
    expect(nativeFailed?.error).toBeTruthy();

    // Both sides actually purged the valid id.
    const httpAfter = await httpList(projectsDir, httpProjectId);
    const nativeAfter = await nativeTransport.list(nativeProjectId);
    expect(httpAfter.resources).toEqual([]);
    expect(nativeAfter.resources).toEqual([]);
  });

  it("surfaces a mid-sweep PurgeSweepError as that item's { ok: false, error } entry identically on both transports, continuing the rest of the batch", async () => {
    const {
      projectsDir,
      projectId: httpProjectId,
      projectPath: httpProjectPath,
    } = await setupHttpProject();
    const {
      nativeFs,
      projectsDir: nativeProjectsDir,
      projectId: nativeProjectId,
      projectPath: nativeProjectPath,
    } = await setupNativeProject();
    const nativeTransport = createNativeTrashTransport({
      fs: nativeFs,
      projectsDir: nativeProjectsDir,
    });

    // Seed a "good" and a "broken" trashed resource on each side, with the
    // same resource ids reused across both fixtures so a single shared spy
    // (keyed on resourceId) can target the same logical item on both sides.
    const httpGoodId = await withProjectsDirEnv(projectsDir, () =>
      seedHttpTrashedResource(httpProjectPath, "Keep Gone", "x"),
    );
    const httpBrokenId = await withProjectsDirEnv(projectsDir, () =>
      seedHttpTrashedResource(httpProjectPath, "Broken Mid-Sweep", "x"),
    );
    const nativeGoodId = await seedNativeTrashedResource(
      nativeFs,
      nativeProjectsDir,
      nativeProjectPath,
      "Keep Gone",
      "x",
    );
    const nativeBrokenId = await seedNativeTrashedResource(
      nativeFs,
      nativeProjectsDir,
      nativeProjectPath,
      "Broken Mid-Sweep",
      "x",
    );

    // `purgeResourceSteps` is a single shared module-level object, so one
    // substitution here affects both the HTTP route call and the native
    // transport call below, as long as both run while the spy is active.
    const spy = vi
      .spyOn(purgeResourceSteps, "purgeRevisions")
      .mockImplementation(async (_projectRoot, resourceId) => {
        if (resourceId === httpBrokenId || resourceId === nativeBrokenId) {
          throw new Error("simulated mid-sweep failure");
        }
      });

    try {
      const httpResults = await httpPurge(projectsDir, httpProjectId, [
        httpGoodId,
        httpBrokenId,
      ]);
      const nativeResults = await nativeTransport.purge(nativeProjectId, [
        nativeGoodId,
        nativeBrokenId,
      ]);

      expect(httpResults).toHaveLength(2);
      expect(nativeResults).toHaveLength(2);

      const httpGoodResult = httpResults.find((r) => r.id === httpGoodId);
      const nativeGoodResult = nativeResults.find((r) => r.id === nativeGoodId);
      expect(httpGoodResult?.ok).toBe(true);
      expect(httpGoodResult?.error).toBeUndefined();
      expect(nativeGoodResult?.ok).toBe(true);
      expect(nativeGoodResult?.error).toBeUndefined();

      const httpBrokenResult = httpResults.find((r) => r.id === httpBrokenId);
      const nativeBrokenResult = nativeResults.find(
        (r) => r.id === nativeBrokenId,
      );
      expect(httpBrokenResult?.ok).toBe(false);
      expect(nativeBrokenResult?.ok).toBe(false);

      const expectedHttpMessage = new PurgeSweepError(
        "revisions",
        httpBrokenId,
        new Error("simulated mid-sweep failure"),
      ).message;
      const expectedNativeMessage = new PurgeSweepError(
        "revisions",
        nativeBrokenId,
        new Error("simulated mid-sweep failure"),
      ).message;
      expect(httpBrokenResult?.error).toBe(expectedHttpMessage);
      expect(nativeBrokenResult?.error).toBe(expectedNativeMessage);

      // The rest of the batch (the good item) is actually gone on both
      // sides, while the broken item's trashed sidecar remains available
      // for a retried purge on both sides.
      const httpAfter = await httpList(projectsDir, httpProjectId);
      const nativeAfter = await nativeTransport.list(nativeProjectId);
      expect(httpAfter.resources.some((r) => r.id === httpGoodId)).toBe(false);
      expect(nativeAfter.resources.some((r) => r.id === nativeGoodId)).toBe(
        false,
      );
      expect(httpAfter.resources.some((r) => r.id === httpBrokenId)).toBe(true);
      expect(nativeAfter.resources.some((r) => r.id === nativeBrokenId)).toBe(
        true,
      );
    } finally {
      spy.mockRestore();
    }
  });
});
