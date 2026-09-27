/**
 * Unit tests for GET /api/resource/[resource-id]/diagnostics-detail
 * (Feature 62, Task 5): the FR-5/FR-8 on-demand, never-persisted located
 * detail of repeated-word phrase occurrences.
 *
 * Exercises the route handler against a `projectId`-scoped
 * `GETWRITE_PROJECTS_DIR`, mirroring `prose-diagnostics-route.test.ts`'s
 * pattern.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET as diagnosticsDetailGet } from "../../app/api/resource/[resource-id]/diagnostics-detail/route";
import { locateRepeatedPhrases } from "../../src/lib/models/prose-diagnostics";
import { generateUUID } from "../../src/lib/models/uuid";
import { removeDirRetry } from "./helpers/fs-utils";

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
    path.join(os.tmpdir(), "gw-diagnostics-detail-route-"),
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

function makeGetRequest(resourceId: string, projectId: string): NextRequest {
  const url = new URL(
    `http://localhost/api/resource/${resourceId}/diagnostics-detail?projectId=${encodeURIComponent(projectId)}`,
  );
  return new NextRequest(url.toString());
}

async function writeResourceContent(
  projectPath: string,
  resourceId: string,
  plainText: string,
): Promise<void> {
  const dir = path.join(projectPath, "resources", resourceId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "content.txt"), plainText, "utf8");
}

async function listDirRecursive(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        out.push(full);
      }
    }
  }
  await walk(dir);
  return out.sort();
}

describe("GET /api/resource/[id]/diagnostics-detail", () => {
  it("returns located repeated-word occurrences whose offsets match the persisted plain text exactly", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = "scene-1";
      const text =
        "One two three. One two three. One two three four five six seven.";
      await writeResourceContent(projectPath, resourceId, text);

      const res = await diagnosticsDetailGet(
        makeGetRequest(resourceId, projectId),
        { params: Promise.resolve({ "resource-id": resourceId }) },
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.locatedRepeatedWords).toEqual(locateRepeatedPhrases(text));
      expect(json.locatedRepeatedWords.length).toBeGreaterThan(0);

      // Independently confirm every offset is correct against the persisted
      // plain text actually written to disk (not merely that both call a
      // function with the same name).
      const persistedText = await fs.readFile(
        path.join(projectPath, "resources", resourceId, "content.txt"),
        "utf8",
      );
      for (const entry of json.locatedRepeatedWords as {
        word: string;
        offsets: number[];
      }[]) {
        for (const offset of entry.offsets) {
          const slice = persistedText.slice(offset, offset + entry.word.length);
          expect(slice.toLowerCase()).toBe(entry.word.toLowerCase());
        }
      }
    });
  });

  it("returns an empty list for a resource with no content, rather than a 404", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const res = await diagnosticsDetailGet(
        makeGetRequest("never-saved", projectId),
        { params: Promise.resolve({ "resource-id": "never-saved" }) },
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ locatedRepeatedWords: [] });
    });
  });

  it("writes nothing to meta/index/ — this is a pure read+compute, never persisted", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = "scene-2";
      const text = "One two three. One two three. One two three four five.";
      await writeResourceContent(projectPath, resourceId, text);

      const indexDir = path.join(projectPath, "meta", "index");
      const before = await listDirRecursive(indexDir);

      const res = await diagnosticsDetailGet(
        makeGetRequest(resourceId, projectId),
        { params: Promise.resolve({ "resource-id": resourceId }) },
      );
      expect(res.status).toBe(200);

      const after = await listDirRecursive(indexDir);
      expect(after).toEqual(before);
    });
  });

  it("returns the uniform 400 when projectId is not a well-formed UUID", async () => {
    const { projectsDir } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const res = await diagnosticsDetailGet(
        makeGetRequest("some-id", "not-a-uuid"),
        { params: Promise.resolve({ "resource-id": "some-id" }) },
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid projectId");
    });
  });
});
