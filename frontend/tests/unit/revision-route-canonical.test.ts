/**
 * Unit tests for the revision route handlers.
 *
 * Requests are scoped by a server-validated `projectId` (resolved against
 * `GETWRITE_PROJECTS_DIR`), per the 29-route tenant enforcement feature (see
 * `tags-api.test.ts` for the canonical pattern).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter, getStorageAdapter } from "../../src/lib/models/io";
import { generateUUID } from "../../src/lib/models/uuid";
import { writeRevision, listRevisions } from "../../src/lib/models/revision";
import { loadResourceContent } from "../../src/lib/tiptap-utils";
import type { TipTapDocument } from "../../src/lib/models";
import { removeDirRetry } from "./helpers/fs-utils";
import {
  GET,
  POST,
  PATCH,
  DELETE,
} from "../../app/api/resource/revision/[resource-id]/route";

// Captured at module load, before any test swaps in the in-memory adapter.
// The revision route reads/writes `content.bin` through Node `fs` directly
// (not the storage adapter), so the derived-content sync must be exercised
// against a real temp directory rather than the in-memory adapter.
const realStorageAdapter = getStorageAdapter();

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

function makeRequest(method: string, body: object): NextRequest {
  return new NextRequest("http://localhost/api/resource/revision/test", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("revision route canonical guards (T014-C)", () => {
  beforeEach(() => {
    setStorageAdapter(createMemoryAdapter());
  });

  describe("POST — single-canonical invariant", () => {
    it("creating a revision with isCanonical:true clears the old canonical", async () => {
      const projectsDir = "/projects-" + generateUUID();
      const projectId = generateUUID();
      const projectPath = path.join(projectsDir, projectId);
      const resourceId = generateUUID();

      await withProjectsDirEnv(projectsDir, async () => {
        await writeRevision(projectPath, resourceId, 1, "first", {
          isCanonical: true,
        });

        const req = makeRequest("POST", {
          projectId,
          content: "second",
          isCanonical: true,
        });
        const res = await POST(req, {
          params: Promise.resolve({ "resource-id": resourceId }),
        });

        expect(res.status).toBe(201);

        const revisions = await listRevisions(projectPath, resourceId);
        const canonicals = revisions.filter((r) => r.isCanonical);
        expect(canonicals).toHaveLength(1);
        expect(canonicals[0]?.versionNumber).toBe(2);
      });
    });

    it("returns the uniform 400 when projectId is not a well-formed UUID", async () => {
      const projectsDir = "/projects-" + generateUUID();
      const resourceId = generateUUID();

      await withProjectsDirEnv(projectsDir, async () => {
        const req = makeRequest("POST", {
          projectId: "not-a-uuid",
          content: "second",
          isCanonical: true,
        });
        const res = await POST(req, {
          params: Promise.resolve({ "resource-id": resourceId }),
        });

        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe("Invalid projectId");
      });
    });
  });

  describe("DELETE — canonical guard", () => {
    it("returns 400 when deleting the canonical revision", async () => {
      const projectsDir = "/projects-" + generateUUID();
      const projectId = generateUUID();
      const projectPath = path.join(projectsDir, projectId);
      const resourceId = generateUUID();

      await withProjectsDirEnv(projectsDir, async () => {
        const canonical = await writeRevision(
          projectPath,
          resourceId,
          1,
          "content",
          { isCanonical: true },
        );

        const req = makeRequest("DELETE", {
          projectId,
          revisionId: canonical.id,
        });
        const res = await DELETE(req, {
          params: Promise.resolve({ "resource-id": resourceId }),
        });

        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toMatch(/canonical/i);
      });
    });

    it("returns 400 when the only revision is canonical", async () => {
      const projectsDir = "/projects-" + generateUUID();
      const projectId = generateUUID();
      const projectPath = path.join(projectsDir, projectId);
      const resourceId = generateUUID();

      await withProjectsDirEnv(projectsDir, async () => {
        const revision = await writeRevision(
          projectPath,
          resourceId,
          1,
          "only",
          { isCanonical: true },
        );

        const req = makeRequest("DELETE", {
          projectId,
          revisionId: revision.id,
        });
        const res = await DELETE(req, {
          params: Promise.resolve({ "resource-id": resourceId }),
        });

        expect(res.status).toBe(400);
      });
    });

    it("returns 200 when deleting a non-canonical revision", async () => {
      const projectsDir = "/projects-" + generateUUID();
      const projectId = generateUUID();
      const projectPath = path.join(projectsDir, projectId);
      const resourceId = generateUUID();

      await withProjectsDirEnv(projectsDir, async () => {
        await writeRevision(projectPath, resourceId, 1, "first", {
          isCanonical: true,
        });
        const nonCanonical = await writeRevision(
          projectPath,
          resourceId,
          2,
          "second",
        );

        const req = makeRequest("DELETE", {
          projectId,
          revisionId: nonCanonical.id,
        });
        const res = await DELETE(req, {
          params: Promise.resolve({ "resource-id": resourceId }),
        });

        expect(res.status).toBe(200);
      });
    });

    it("exactly one canonical remains after deleting a non-canonical", async () => {
      const projectsDir = "/projects-" + generateUUID();
      const projectId = generateUUID();
      const projectPath = path.join(projectsDir, projectId);
      const resourceId = generateUUID();

      await withProjectsDirEnv(projectsDir, async () => {
        await writeRevision(projectPath, resourceId, 1, "first", {
          isCanonical: true,
        });
        const nonCanonical = await writeRevision(
          projectPath,
          resourceId,
          2,
          "second",
        );

        const req = makeRequest("DELETE", {
          projectId,
          revisionId: nonCanonical.id,
        });
        await DELETE(req, {
          params: Promise.resolve({ "resource-id": resourceId }),
        });

        const remaining = await listRevisions(projectPath, resourceId);
        const canonicals = remaining.filter((r) => r.isCanonical);
        expect(canonicals).toHaveLength(1);
        expect(canonicals[0]?.versionNumber).toBe(1);
      });
    });

    it("returns the uniform 400 when projectId is not a well-formed UUID", async () => {
      const projectsDir = "/projects-" + generateUUID();
      const resourceId = generateUUID();

      await withProjectsDirEnv(projectsDir, async () => {
        const req = makeRequest("DELETE", {
          projectId: "../../etc/passwd",
          revisionId: generateUUID(),
        });
        const res = await DELETE(req, {
          params: Promise.resolve({ "resource-id": resourceId }),
        });

        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe("Invalid projectId");
      });
    });
  });

  describe("GET — projectId guard", () => {
    it("returns the uniform 400 when projectId is not a well-formed UUID", async () => {
      const projectsDir = "/projects-" + generateUUID();
      const resourceId = generateUUID();

      await withProjectsDirEnv(projectsDir, async () => {
        const url = new URL(
          `http://localhost/api/resource/revision/${resourceId}?projectId=not-a-uuid&revisionId=${generateUUID()}`,
        );
        const res = await GET(new NextRequest(url.toString()), {
          params: Promise.resolve({ "resource-id": resourceId }),
        });

        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe("Invalid projectId");
      });
    });
  });
});

describe("revision route — derived content sync on canonical PATCH", () => {
  let projectsDir: string;
  let projectId: string;
  let projectPath: string;

  beforeEach(async () => {
    // Real filesystem: the route persists content.bin via Node fs directly.
    setStorageAdapter(realStorageAdapter);
    projectsDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-rev-sync-"),
    );
    projectId = generateUUID();
    projectPath = path.join(projectsDir, projectId);
  });

  afterEach(async () => {
    await removeDirRetry(projectsDir);
  });

  function tiptapDoc(text: string): TipTapDocument {
    return {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    } as TipTapDocument;
  }

  it("resolves projectId to the on-disk project and returns revision content", async () => {
    const resourceId = generateUUID();

    await withProjectsDirEnv(projectsDir, async () => {
      const revision = await writeRevision(
        projectPath,
        resourceId,
        1,
        "hello",
        { isCanonical: true },
      );

      const url = new URL(
        `http://localhost/api/resource/revision/${resourceId}?projectId=${projectId}&revisionId=${revision.id}`,
      );
      const res = await GET(new NextRequest(url.toString()), {
        params: Promise.resolve({ "resource-id": resourceId }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { content: string };
      expect(body.content).toBe("hello");
    });
  });

  it("rewrites content.txt/content.tiptap.json so a compile sees new text without reload", async () => {
    const resourceId = generateUUID();

    await withProjectsDirEnv(projectsDir, async () => {
      const canonical = await writeRevision(
        projectPath,
        resourceId,
        1,
        JSON.stringify(tiptapDoc("old text")),
        { isCanonical: true },
      );

      // Autosave new content in place — exactly what the editor's canonical
      // autosave does. No remount/reload happens afterwards.
      const req = makeRequest("PATCH", {
        projectId,
        revisionId: canonical.id,
        content: JSON.stringify(tiptapDoc("brand new text")),
      });
      const res = await PATCH(req, {
        params: Promise.resolve({ "resource-id": resourceId }),
      });
      expect(res.status).toBe(200);

      // Compile/export read these derived files; they must reflect the edit now.
      const { plainText, tiptap } = await loadResourceContent(
        projectPath,
        resourceId,
      );
      expect(plainText).toContain("brand new text");
      expect(plainText).not.toContain("old text");
      expect(JSON.stringify(tiptap)).toContain("brand new text");
    });
  });

  it("no-ops on non-TipTap content (leaves derived files unwritten)", async () => {
    const resourceId = generateUUID();

    await withProjectsDirEnv(projectsDir, async () => {
      const canonical = await writeRevision(
        projectPath,
        resourceId,
        1,
        "plain",
        { isCanonical: true },
      );

      const req = makeRequest("PATCH", {
        projectId,
        revisionId: canonical.id,
        content: "not json",
      });
      const res = await PATCH(req, {
        params: Promise.resolve({ "resource-id": resourceId }),
      });

      expect(res.status).toBe(200);
      const { plainText } = await loadResourceContent(projectPath, resourceId);
      // writeRevision never wrote content.txt, and the sync skipped non-doc input.
      expect(plainText).toBeUndefined();
    });
  });

  it("returns the uniform 400 when projectId is not a well-formed UUID", async () => {
    const resourceId = generateUUID();

    await withProjectsDirEnv(projectsDir, async () => {
      const req = makeRequest("PATCH", {
        projectId: "not-a-uuid",
        revisionId: generateUUID(),
        content: "not json",
      });
      const res = await PATCH(req, {
        params: Promise.resolve({ "resource-id": resourceId }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid projectId");
    });
  });
});
