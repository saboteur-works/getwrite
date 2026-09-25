/**
 * Unit tests for the revision route handlers.
 *
 * Requests are scoped by a server-validated `projectId` (resolved against
 * `GETWRITE_PROJECTS_DIR`), per the 29-route tenant enforcement feature (see
 * `tags-api.test.ts` for the canonical pattern).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
import { ProjectLockedError } from "../../src/lib/models/crypto/adapter-selection";

// Feature 54, Task 16: a partial mock of revision-core so a single test per
// handler can force its underlying core function to reject with a
// locked-access error, while every other test in this file keeps exercising
// the real implementation.
vi.mock("../../src/lib/models/revision-core", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/models/revision-core")
  >("../../src/lib/models/revision-core");
  return {
    ...actual,
    readRevision: vi.fn(actual.readRevision),
    createRevision: vi.fn(actual.createRevision),
    deleteRevision: vi.fn(actual.deleteRevision),
    setCanonicalRevision: vi.fn(actual.setCanonicalRevision),
    updateRevisionInPlace: vi.fn(actual.updateRevisionInPlace),
    setRevisionPreserve: vi.fn(actual.setRevisionPreserve),
  };
});

import {
  readRevision,
  createRevision,
  deleteRevision,
  setCanonicalRevision,
  setRevisionPreserve,
  PROTECTED_REVISION_DELETE_MESSAGE,
} from "../../src/lib/models/revision-core";
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

describe("revision route — locked-access rethrow (Feature 54, Task 16)", () => {
  beforeEach(() => {
    setStorageAdapter(createMemoryAdapter());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps a ProjectLockedError from readRevision to 401 instead of the route's fixed 404/500 shape (handleGet)", async () => {
    const projectsDir = "/projects-" + generateUUID();
    const projectId = generateUUID();
    const resourceId = generateUUID();

    await withProjectsDirEnv(projectsDir, async () => {
      vi.mocked(readRevision).mockRejectedValueOnce(
        new ProjectLockedError(projectId),
      );

      const url = new URL(
        `http://localhost/api/resource/revision/${resourceId}?projectId=${projectId}&revisionId=${generateUUID()}`,
      );
      const res = await GET(new NextRequest(url.toString()), {
        params: Promise.resolve({ "resource-id": resourceId }),
      });

      expect(res.status).toBe(401);
    });
  });

  it("maps a ProjectLockedError from createRevision to 401 instead of the route's fixed 500 shape (handlePost)", async () => {
    const projectsDir = "/projects-" + generateUUID();
    const projectId = generateUUID();
    const resourceId = generateUUID();

    await withProjectsDirEnv(projectsDir, async () => {
      vi.mocked(createRevision).mockRejectedValueOnce(
        new ProjectLockedError(projectId),
      );

      const req = makeRequest("POST", {
        projectId,
        content: "second",
        isCanonical: true,
      });
      const res = await POST(req, {
        params: Promise.resolve({ "resource-id": resourceId }),
      });

      expect(res.status).toBe(401);
    });
  });

  it("maps a ProjectLockedError from deleteRevision to 401 instead of the route's fixed 404/500 shape (handleDelete)", async () => {
    const projectsDir = "/projects-" + generateUUID();
    const projectId = generateUUID();
    const resourceId = generateUUID();

    await withProjectsDirEnv(projectsDir, async () => {
      vi.mocked(deleteRevision).mockRejectedValueOnce(
        new ProjectLockedError(projectId),
      );

      const req = makeRequest("DELETE", {
        projectId,
        revisionId: generateUUID(),
      });
      const res = await DELETE(req, {
        params: Promise.resolve({ "resource-id": resourceId }),
      });

      expect(res.status).toBe(401);
    });
  });

  it("maps a ProjectLockedError from setCanonicalRevision to 401 instead of the route's fixed 404/500 shape (handlePatch)", async () => {
    const projectsDir = "/projects-" + generateUUID();
    const projectId = generateUUID();
    const resourceId = generateUUID();

    await withProjectsDirEnv(projectsDir, async () => {
      vi.mocked(setCanonicalRevision).mockRejectedValueOnce(
        new ProjectLockedError(projectId),
      );

      const req = makeRequest("PATCH", {
        projectId,
        revisionId: generateUUID(),
      });
      const res = await PATCH(req, {
        params: Promise.resolve({ "resource-id": resourceId }),
      });

      expect(res.status).toBe(401);
    });
  });
});

describe("revision route — protect revision (FR-8, FR-10, FR-11)", () => {
  beforeEach(() => {
    setStorageAdapter(createMemoryAdapter());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function seed(): Promise<{
    projectsDir: string;
    projectId: string;
    projectPath: string;
    resourceId: string;
  }> {
    const projectsDir = "/projects-" + generateUUID();
    const projectId = generateUUID();
    return {
      projectsDir,
      projectId,
      projectPath: path.join(projectsDir, projectId),
      resourceId: generateUUID(),
    };
  }

  const patch = (body: object, resourceId: string): ReturnType<typeof PATCH> =>
    PATCH(makeRequest("PATCH", body), {
      params: Promise.resolve({ "resource-id": resourceId }),
    });

  it("preserve:true returns 200 with the updated revision and persists it", async () => {
    const { projectsDir, projectId, projectPath, resourceId } = await seed();
    await withProjectsDirEnv(projectsDir, async () => {
      await writeRevision(projectPath, resourceId, 1, "a", {
        isCanonical: true,
      });
      const rev = await writeRevision(projectPath, resourceId, 2, "b", {
        metadata: { name: "Draft" },
      });

      const res = await patch(
        { projectId, revisionId: rev.id, preserve: true },
        resourceId,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        id: string;
        isCanonical: boolean;
        metadata: Record<string, unknown>;
      };
      expect(body.id).toBe(rev.id);
      expect(body.metadata.preserve).toBe(true);
      expect(body.metadata.name).toBe("Draft");
      expect(body.isCanonical).toBe(false);

      const stored = (await listRevisions(projectPath, resourceId)).find(
        (r) => r.id === rev.id,
      );
      expect(stored?.metadata?.preserve).toBe(true);
    });
  });

  it("preserve:false clears the flag", async () => {
    const { projectsDir, projectId, projectPath, resourceId } = await seed();
    await withProjectsDirEnv(projectsDir, async () => {
      const rev = await writeRevision(projectPath, resourceId, 1, "a", {
        isCanonical: true,
        metadata: { preserve: true },
      });
      const res = await patch(
        { projectId, revisionId: rev.id, preserve: false },
        resourceId,
      );
      expect(res.status).toBe(200);
      const stored = (await listRevisions(projectPath, resourceId))[0];
      expect(stored?.metadata?.preserve).toBeUndefined();
    });
  });

  it("rejects {content, preserve} with 400 and applies neither", async () => {
    const { projectsDir, projectId, projectPath, resourceId } = await seed();
    await withProjectsDirEnv(projectsDir, async () => {
      const rev = await writeRevision(projectPath, resourceId, 1, "orig", {
        isCanonical: true,
      });
      const res = await patch(
        { projectId, revisionId: rev.id, content: "new", preserve: true },
        resourceId,
      );
      expect(res.status).toBe(400);
      const read = await readRevision(projectPath, resourceId, rev.id);
      expect(read.content).toBe("orig");
      expect(read.revision.metadata?.preserve).toBeUndefined();
    });
  });

  it("rejects non-boolean preserve with 400 without changes", async () => {
    const { projectsDir, projectId, projectPath, resourceId } = await seed();
    await withProjectsDirEnv(projectsDir, async () => {
      const rev = await writeRevision(projectPath, resourceId, 1, "a", {
        isCanonical: true,
      });
      for (const bad of ["true", 1, null]) {
        const res = await patch(
          { projectId, revisionId: rev.id, preserve: bad },
          resourceId,
        );
        expect(res.status).toBe(400);
      }
      const stored = (await listRevisions(projectPath, resourceId))[0];
      expect(stored?.metadata?.preserve).toBeUndefined();
    });
  });

  it("does not accept a generic metadata merge (name unchanged)", async () => {
    const { projectsDir, projectId, projectPath, resourceId } = await seed();
    await withProjectsDirEnv(projectsDir, async () => {
      await writeRevision(projectPath, resourceId, 1, "a", {
        isCanonical: true,
      });
      const rev = await writeRevision(projectPath, resourceId, 2, "b", {
        metadata: { name: "Keep" },
      });
      await patch(
        {
          projectId,
          revisionId: rev.id,
          preserve: true,
          metadata: { name: "Hacked" },
        },
        resourceId,
      );
      await patch(
        { projectId, revisionId: rev.id, metadata: { name: "Hacked2" } },
        resourceId,
      );
      const stored = (await listRevisions(projectPath, resourceId)).find(
        (r) => r.id === rev.id,
      );
      expect(stored?.metadata?.name).toBe("Keep");
    });
  });

  it("content-only and neither-field behaviours are unchanged", async () => {
    const { projectsDir, projectId, projectPath, resourceId } = await seed();
    await withProjectsDirEnv(projectsDir, async () => {
      const canonical = await writeRevision(projectPath, resourceId, 1, "a", {
        isCanonical: true,
      });
      const other = await writeRevision(projectPath, resourceId, 2, "b");

      const contentRes = await patch(
        { projectId, revisionId: canonical.id, content: "edited" },
        resourceId,
      );
      expect(contentRes.status).toBe(200);
      expect(
        (await readRevision(projectPath, resourceId, canonical.id)).content,
      ).toBe("edited");

      const flipRes = await patch(
        { projectId, revisionId: other.id },
        resourceId,
      );
      expect(flipRes.status).toBe(200);
      const revs = await listRevisions(projectPath, resourceId);
      expect(revs.find((r) => r.id === other.id)?.isCanonical).toBe(true);
      expect(revs.find((r) => r.id === canonical.id)?.isCanonical).toBe(false);
    });
  });

  it("preserve on an unknown revision returns 404", async () => {
    const { projectsDir, projectId, projectPath, resourceId } = await seed();
    await withProjectsDirEnv(projectsDir, async () => {
      await writeRevision(projectPath, resourceId, 1, "a", {
        isCanonical: true,
      });
      const res = await patch(
        { projectId, revisionId: generateUUID(), preserve: true },
        resourceId,
      );
      expect(res.status).toBe(404);
    });
  });

  it("rethrows a locked-access error from setRevisionPreserve as 401", async () => {
    const { projectsDir, projectId, resourceId } = await seed();
    await withProjectsDirEnv(projectsDir, async () => {
      vi.mocked(setRevisionPreserve).mockRejectedValueOnce(
        new ProjectLockedError(projectId),
      );
      const res = await patch(
        { projectId, revisionId: generateUUID(), preserve: true },
        resourceId,
      );
      expect(res.status).toBe(401);
    });
  });

  it("DELETE of a protected revision returns 400 with the shared message and keeps it", async () => {
    const { projectsDir, projectId, projectPath, resourceId } = await seed();
    await withProjectsDirEnv(projectsDir, async () => {
      await writeRevision(projectPath, resourceId, 1, "a", {
        isCanonical: true,
      });
      const rev = await writeRevision(projectPath, resourceId, 2, "b", {
        metadata: { preserve: true },
      });
      const res = await DELETE(
        makeRequest("DELETE", { projectId, revisionId: rev.id }),
        { params: Promise.resolve({ "resource-id": resourceId }) },
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe(PROTECTED_REVISION_DELETE_MESSAGE);
      const ids = (await listRevisions(projectPath, resourceId)).map(
        (r) => r.id,
      );
      expect(ids).toContain(rev.id);
    });
  });
});
