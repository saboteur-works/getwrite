/**
 * Unit tests for GET /api/resource/[resource-id]/diagnostics (Feature 62,
 * Task 4).
 *
 * Exercises the route handler against a `projectId`-scoped
 * `GETWRITE_PROJECTS_DIR`, mirroring `mentions-routes.test.ts`'s pattern.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../src/lib/models/indexer-queue", async (importActual) => {
  const actual =
    await importActual<typeof import("../../src/lib/models/indexer-queue")>();
  return {
    ...actual,
    loadPersistedPlainText: vi.fn(actual.loadPersistedPlainText),
  };
});

import { GET as diagnosticsGet } from "../../app/api/resource/[resource-id]/diagnostics/route";
import {
  loadDiagnosticsIndex,
  persistDiagnosticsIndex,
} from "../../src/lib/models/diagnostics-index";
import { loadPersistedPlainText } from "../../src/lib/models/indexer-queue";
import {
  dialogueRatio,
  averageSentenceLength,
  topRepeatedWords,
  HEURISTIC_VERSION,
} from "../../src/lib/models/prose-diagnostics";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { generateUUID } from "../../src/lib/models/uuid";
import { removeDirRetry } from "./helpers/fs-utils";

const tmpDirs: string[] = [];

afterEach(async () => {
  vi.mocked(loadPersistedPlainText).mockClear();
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
    path.join(os.tmpdir(), "gw-diagnostics-route-"),
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
    `http://localhost/api/resource/${resourceId}/diagnostics?projectId=${encodeURIComponent(projectId)}`,
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

describe("GET /api/resource/[id]/diagnostics", () => {
  it("computes and returns fresh diagnostics for a resource with no persisted record", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = "scene-1";
      const text =
        '"Hello there," she said. "Come in." He walked slowly into the room.';
      await writeResourceContent(projectPath, resourceId, text);

      const res = await diagnosticsGet(makeGetRequest(resourceId, projectId), {
        params: Promise.resolve({ "resource-id": resourceId }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.dialogueRatio).toBeCloseTo(dialogueRatio(text));
      expect(json.averageSentenceLength).toBeCloseTo(
        averageSentenceLength(text),
      );
      expect(json.topRepeatedWords).toEqual(topRepeatedWords(text));

      const persisted = await loadDiagnosticsIndex(projectPath);
      expect(persisted[resourceId]?.heuristicVersion).toBe(HEURISTIC_VERSION);
    });
  });

  it("returns a zeroed shape for a resource with no content and no record yet, rather than a 404", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const res = await diagnosticsGet(
        makeGetRequest("never-saved", projectId),
        { params: Promise.resolve({ "resource-id": "never-saved" }) },
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({
        dialogueRatio: 0,
        averageSentenceLength: 0,
        topRepeatedWords: [],
      });
    });
  });

  it("rebuilds a stale (older heuristicVersion) record before responding", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = "scene-2";
      const text = "One two three. One two three. One two three four five six.";
      await writeResourceContent(projectPath, resourceId, text);

      await persistDiagnosticsIndex(projectPath, {
        [resourceId]: {
          dialogueRatio: 0.99,
          averageSentenceLength: 999,
          topRepeatedWords: [{ word: "stale", count: 42 }],
          heuristicVersion: HEURISTIC_VERSION - 1,
        },
      });

      const res = await diagnosticsGet(makeGetRequest(resourceId, projectId), {
        params: Promise.resolve({ "resource-id": resourceId }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.dialogueRatio).toBeCloseTo(dialogueRatio(text));
      expect(json.averageSentenceLength).toBeCloseTo(
        averageSentenceLength(text),
      );
      expect(json.topRepeatedWords).toEqual(topRepeatedWords(text));

      const persisted = await loadDiagnosticsIndex(projectPath);
      expect(persisted[resourceId]?.heuristicVersion).toBe(HEURISTIC_VERSION);
    });
  });

  it("returns the uniform 400 when projectId is not a well-formed UUID", async () => {
    const { projectsDir } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const res = await diagnosticsGet(
        makeGetRequest("some-id", "not-a-uuid"),
        { params: Promise.resolve({ "resource-id": "some-id" }) },
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid projectId");
    });
  });

  describe("locked/keyless project access — fail-closed, not 200-with-empty-body", () => {
    it("maps a rethrown ProjectLockedError to 401", async () => {
      const { projectsDir, projectId } = await makeTmpProjectsDir();
      await withProjectsDirEnv(projectsDir, async () => {
        vi.mocked(loadPersistedPlainText).mockRejectedValueOnce(
          new ProjectLockedError(projectId),
        );
        const res = await diagnosticsGet(
          makeGetRequest("scene-locked", projectId),
          { params: Promise.resolve({ "resource-id": "scene-locked" }) },
        );
        expect(res.status).toBe(401);
      });
    });

    it("maps a rethrown MissingProjectKeyError to 409", async () => {
      const { projectsDir, projectId } = await makeTmpProjectsDir();
      await withProjectsDirEnv(projectsDir, async () => {
        vi.mocked(loadPersistedPlainText).mockRejectedValueOnce(
          new MissingProjectKeyError(projectId),
        );
        const res = await diagnosticsGet(
          makeGetRequest("scene-keyless", projectId),
          { params: Promise.resolve({ "resource-id": "scene-keyless" }) },
        );
        expect(res.status).toBe(409);
      });
    });
  });
});
