/**
 * entity-mention-navigation Task 5: native/web parity for
 * `getEntityMentionedIn`'s `offsets` field (FR-2).
 *
 * Neither `mentions-routes.test.ts` (HTTP route) nor any prior test
 * exercised `native-mentions-backend.ts` at all. This test seeds the same
 * fixture (mention index + resource content + sidecar) into both a real
 * temp-dir project (read by the HTTP route via `getEntityMentionedIn`) and a
 * fake Capacitor filesystem (read by `createNativeMentionsTransport`), then
 * asserts the two results — in particular each entry's `offsets` array — are
 * identical, mirroring `entity-mention-counts-native-web-parity.test.ts`'s
 * pattern for this module.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET as mentionedInGet } from "../../app/api/resource/[resource-id]/mentioned-in/route";
import { persistMentionIndex } from "../../src/lib/models/mention-index";
import type { MentionIndex } from "../../src/lib/models/mention-index";
import { generateUUID } from "../../src/lib/models/uuid";
import { removeDirRetry } from "./helpers/fs-utils";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import { createNativeMentionsTransport } from "../../src/store/transport/native-mentions-backend";
import type { EntityMentionedIn } from "../../src/lib/models/mentions-core";

const tmpDirs: string[] = [];
const NATIVE_PROJECTS_DIR = "/projects";
const PLAIN_TEXT = "Aria drew her blade. Later, Aria sheathed it again.";

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

function buildFixture(
  ariaId: string,
  sceneId: string,
  offsets: number[],
): MentionIndex {
  return {
    [sceneId]: [
      { entityId: ariaId, resourceId: sceneId, count: offsets.length, offsets },
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

function makeGetRequest(entityId: string, projectId: string): NextRequest {
  const url = new URL(
    `http://localhost/api/resource/${entityId}/mentioned-in?projectId=${encodeURIComponent(projectId)}`,
  );
  return new NextRequest(url.toString());
}

describe("native mentions transport — native/web parity for getEntityMentionedIn offsets (FR-2)", () => {
  it("returns identical mentionedIn rows, including offsets, for the same fixture on both transports", async () => {
    const ariaId = generateUUID();
    const sceneId = generateUUID();
    const offsets = [0, 29];
    const fixture = buildFixture(ariaId, sceneId, offsets);

    // HTTP side: real temp-dir project, real route handler.
    const projectsDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "gw-mentions-backend-parity-"),
    );
    tmpDirs.push(projectsDir);
    const httpProjectId = generateUUID();
    const httpProjectPath = path.join(projectsDir, httpProjectId);
    await fs.mkdir(path.join(httpProjectPath, "resources", sceneId), {
      recursive: true,
    });
    await fs.mkdir(path.join(httpProjectPath, "meta"), { recursive: true });
    await fs.writeFile(
      path.join(httpProjectPath, "resources", sceneId, "content.txt"),
      PLAIN_TEXT,
      "utf8",
    );
    await fs.writeFile(
      path.join(httpProjectPath, "meta", `resource-${sceneId}.meta.json`),
      JSON.stringify({ id: sceneId, name: "Chapter One" }),
      "utf8",
    );
    await persistMentionIndex(httpProjectPath, fixture);

    const httpMentionedIn = await withProjectsDirEnv(projectsDir, async () => {
      const res = await mentionedInGet(makeGetRequest(ariaId, httpProjectId), {
        params: Promise.resolve({ "resource-id": ariaId }),
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as { mentionedIn: EntityMentionedIn[] };
      return json.mentionedIn;
    });

    // Native side: fake Capacitor filesystem, in-process transport.
    const nativeFs = createFakeCapacitorFilesystem();
    const nativeAdapter = capacitorFsAdapter(nativeFs);
    const nativeProjectId = generateUUID();
    const nativeProjectPath = path.join(NATIVE_PROJECTS_DIR, nativeProjectId);
    await nativeAdapter.mkdir(
      path.join(nativeProjectPath, "resources", sceneId),
      { recursive: true },
    );
    await nativeAdapter.mkdir(path.join(nativeProjectPath, "meta"), {
      recursive: true,
    });
    await nativeAdapter.writeFile(
      path.join(nativeProjectPath, "resources", sceneId, "content.txt"),
      PLAIN_TEXT,
    );
    await nativeAdapter.writeFile(
      path.join(nativeProjectPath, "meta", `resource-${sceneId}.meta.json`),
      JSON.stringify({ id: sceneId, name: "Chapter One" }),
    );
    await nativeAdapter.writeFile(
      path.join(nativeProjectPath, "meta", "index", "mentions.json"),
      JSON.stringify(fixture, null, 2),
    );

    const nativeTransport = createNativeMentionsTransport({
      fs: nativeFs,
      projectsDir: NATIVE_PROJECTS_DIR,
    });
    const nativeMentionedIn = await nativeTransport.getEntityMentionedIn(
      nativeProjectId,
      ariaId,
    );

    expect(httpMentionedIn).toHaveLength(1);
    expect(nativeMentionedIn).toHaveLength(1);
    expect(nativeMentionedIn[0]?.offsets).toEqual(offsets);
    expect(httpMentionedIn[0]?.offsets).toEqual(offsets);
    expect(nativeMentionedIn).toEqual(httpMentionedIn);
  });

  it("degrades gracefully to [] on an invalid projectId, matching the HTTP transport's degrade-on-failure contract", async () => {
    const nativeFs = createFakeCapacitorFilesystem();
    const transport = createNativeMentionsTransport({
      fs: nativeFs,
      projectsDir: NATIVE_PROJECTS_DIR,
    });

    await expect(
      transport.getEntityMentionedIn("not-a-uuid", generateUUID()),
    ).resolves.toEqual([]);
  });
});
