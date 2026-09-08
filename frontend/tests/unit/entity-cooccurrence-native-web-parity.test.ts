/**
 * entity-cooccurrence Task 4: native/web parity for the per-entity
 * co-occurrence map (FR-1).
 *
 * Neither the route test (`entity-cooccurrence-route.test.ts`) nor the
 * native-backend test (`native-entity-cooccurrence-backend.test.ts`) asserts
 * that the two transports return the *same* shape for equivalent underlying
 * project data — each only exercises its own side. This test seeds the same
 * fixture mention index into both a real temp-dir project (read by the HTTP
 * route via `getEntityCooccurrence`) and a fake Capacitor filesystem (read by
 * `createNativeEntityCooccurrenceTransport`), then asserts the two results
 * are identical — the co-occurrence map a caller on either runtime receives
 * is the same shape, keyed the same way. Mirrors
 * `entity-mention-counts-native-web-parity.test.ts`.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "../../app/api/project/[project-id]/entity-cooccurrence/route";
import { persistMentionIndex } from "../../src/lib/models/mention-index";
import type { MentionIndex } from "../../src/lib/models/mention-index";
import type { EntityCooccurrenceEntry } from "../../src/lib/models/mentions-core";
import { generateUUID } from "../../src/lib/models/uuid";
import { removeDirRetry } from "./helpers/fs-utils";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import { createNativeEntityCooccurrenceTransport } from "../../src/store/transport/native-entity-cooccurrence-backend";

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

/** Same fixture used for both runtimes: two entities across two resources. */
function buildFixture(
  ariaId: string,
  brannId: string,
  resourceOne: string,
  resourceTwo: string,
): MentionIndex {
  return {
    [resourceOne]: [
      { entityId: ariaId, resourceId: resourceOne, count: 2, offsets: [0, 10] },
      { entityId: brannId, resourceId: resourceOne, count: 1, offsets: [20] },
    ],
    [resourceTwo]: [
      { entityId: ariaId, resourceId: resourceTwo, count: 1, offsets: [5] },
    ],
  };
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

function makeGetRequest(projectId: string): NextRequest {
  const url = new URL(
    `http://localhost/api/project/${projectId}/entity-cooccurrence`,
  );
  return new NextRequest(url.toString());
}

describe("entity co-occurrence — native/web parity (FR-1)", () => {
  it("returns identical co-occurrence maps for the same fixture on both transports", async () => {
    const ariaId = generateUUID();
    const brannId = generateUUID();
    const resourceOne = generateUUID();
    const resourceTwo = generateUUID();
    const fixture = buildFixture(ariaId, brannId, resourceOne, resourceTwo);

    // HTTP side: real temp-dir project, real route handler.
    const projectsDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "gw-entity-cooccurrence-parity-"),
    );
    tmpDirs.push(projectsDir);
    const httpProjectId = generateUUID();
    const httpProjectPath = path.join(projectsDir, httpProjectId);
    await fs.mkdir(httpProjectPath, { recursive: true });
    await persistMentionIndex(httpProjectPath, fixture);

    const httpCooccurrence = await withProjectsDirEnv(projectsDir, async () => {
      const res = await GET(makeGetRequest(httpProjectId), {
        params: Promise.resolve({ "project-id": httpProjectId }),
      });
      expect(res.status).toBe(200);
      return (await res.json()) as Record<string, EntityCooccurrenceEntry[]>;
    });

    // Native side: fake Capacitor filesystem, in-process transport.
    const nativeProjectsDir = "/projects";
    const nativeFs = createFakeCapacitorFilesystem();
    const nativeAdapter = capacitorFsAdapter(nativeFs);
    const nativeProjectId = generateUUID();
    const indexDir = path.join(
      nativeProjectsDir,
      nativeProjectId,
      "meta",
      "index",
    );
    await nativeAdapter.mkdir(indexDir, { recursive: true });
    await nativeAdapter.writeFile(
      path.join(indexDir, "mentions.json"),
      JSON.stringify(fixture, null, 2),
    );

    const nativeTransport = createNativeEntityCooccurrenceTransport({
      fs: nativeFs,
      projectsDir: nativeProjectsDir,
    });
    const nativeCooccurrence =
      await nativeTransport.getEntityCooccurrence(nativeProjectId);

    // Both fixtures use the same entity/resource ids, so the co-occurrence
    // maps must match exactly, not just structurally.
    expect(nativeCooccurrence).toEqual(httpCooccurrence);
    expect(nativeCooccurrence).toEqual({
      [ariaId]: [{ entityId: brannId, count: 1, resourceIds: [resourceOne] }],
      [brannId]: [{ entityId: ariaId, count: 1, resourceIds: [resourceOne] }],
    });
  });

  it("returns the identical empty co-occurrence map {} on both transports for a project with no mention index", async () => {
    const projectsDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "gw-entity-cooccurrence-parity-empty-"),
    );
    tmpDirs.push(projectsDir);
    const httpProjectId = generateUUID();
    await fs.mkdir(path.join(projectsDir, httpProjectId), { recursive: true });

    const httpCooccurrence = await withProjectsDirEnv(projectsDir, async () => {
      const res = await GET(makeGetRequest(httpProjectId), {
        params: Promise.resolve({ "project-id": httpProjectId }),
      });
      return (await res.json()) as Record<string, EntityCooccurrenceEntry[]>;
    });

    const nativeFs = createFakeCapacitorFilesystem();
    const nativeAdapter = capacitorFsAdapter(nativeFs);
    const nativeProjectsDir = "/projects";
    const nativeProjectId = generateUUID();
    await nativeAdapter.mkdir(path.join(nativeProjectsDir, nativeProjectId), {
      recursive: true,
    });
    const nativeTransport = createNativeEntityCooccurrenceTransport({
      fs: nativeFs,
      projectsDir: nativeProjectsDir,
    });
    const nativeCooccurrence =
      await nativeTransport.getEntityCooccurrence(nativeProjectId);

    expect(nativeCooccurrence).toEqual({});
    expect(httpCooccurrence).toEqual({});
    expect(nativeCooccurrence).toEqual(httpCooccurrence);
  });
});
