/**
 * Unit tests for:
 * - GET/POST /api/project/[project-id]/entity-relationships
 * - POST /api/project/[project-id]/entity-relationships/remove
 *
 * Exercises the route handlers against a `projectId`-scoped
 * `GETWRITE_PROJECTS_DIR`, per the pattern established in
 * `entity-cooccurrence-route.test.ts`.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import {
  GET,
  POST,
} from "../../app/api/project/[project-id]/entity-relationships/route";
import { POST as REMOVE } from "../../app/api/project/[project-id]/entity-relationships/remove/route";
import type { EntityRelationshipEdge } from "../../src/lib/models/entity-relationships";
import { generateUUID } from "../../src/lib/models/uuid";
import { removeDirRetry } from "./helpers/fs-utils";

const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

async function makeTmpProjectsDir(
  relationshipTypes: string[] = ["ally"],
): Promise<{ projectsDir: string; projectId: string; projectPath: string }> {
  const projectsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-entity-relationships-route-"),
  );
  tmpDirs.push(projectsDir);
  const projectId = generateUUID();
  const projectPath = path.join(projectsDir, projectId);
  await fs.mkdir(projectPath, { recursive: true });
  await fs.writeFile(
    path.join(projectPath, "project.json"),
    JSON.stringify({ config: { relationshipTypes } }, null, 2),
    "utf8",
  );
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

function makeGetRequest(projectId: string): NextRequest {
  const url = new URL(
    `http://localhost/api/project/${projectId}/entity-relationships`,
  );
  return new NextRequest(url.toString());
}

function makePostRequest(
  projectId: string,
  body: Record<string, unknown>,
): NextRequest {
  const url = new URL(
    `http://localhost/api/project/${projectId}/entity-relationships`,
  );
  return new NextRequest(url.toString(), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function makeRemoveRequest(
  projectId: string,
  body: Record<string, unknown>,
): NextRequest {
  const url = new URL(
    `http://localhost/api/project/${projectId}/entity-relationships/remove`,
  );
  return new NextRequest(url.toString(), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("GET /api/project/[project-id]/entity-relationships", () => {
  it("returns persisted edges verbatim", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const createRes = await POST(
        makePostRequest(projectId, {
          sourceEntityId: SOURCE_ID,
          targetEntityId: TARGET_ID,
          relationshipType: "ally",
        }),
        { params: Promise.resolve({ "project-id": projectId }) },
      );
      expect(createRes.status).toBe(201);
      const created = (await createRes.json()) as EntityRelationshipEdge;

      const listRes = await GET(makeGetRequest(projectId), {
        params: Promise.resolve({ "project-id": projectId }),
      });
      expect(listRes.status).toBe(200);
      const listed = (await listRes.json()) as EntityRelationshipEdge[];
      expect(listed).toEqual([created]);
    });
  });

  it("returns the uniform 400 when project-id is not a well-formed UUID", async () => {
    const { projectsDir } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const res = await GET(makeGetRequest("not-a-uuid"), {
        params: Promise.resolve({ "project-id": "not-a-uuid" }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid projectId");
    });
  });
});

describe("POST /api/project/[project-id]/entity-relationships", () => {
  it("creates and returns the new edge with a 201", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const res = await POST(
        makePostRequest(projectId, {
          sourceEntityId: SOURCE_ID,
          targetEntityId: TARGET_ID,
          relationshipType: "ally",
        }),
        { params: Promise.resolve({ "project-id": projectId }) },
      );
      expect(res.status).toBe(201);
      const edge = (await res.json()) as EntityRelationshipEdge;
      expect(edge.sourceEntityId).toBe(SOURCE_ID);
      expect(edge.targetEntityId).toBe(TARGET_ID);
      expect(edge.relationshipType).toBe("ally");
      expect(typeof edge.id).toBe("string");
    });
  });

  it("returns the pre-existing matching edge (FR-17) rather than a duplicate", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const body = {
        sourceEntityId: SOURCE_ID,
        targetEntityId: TARGET_ID,
        relationshipType: "ally",
      };
      const first = await POST(makePostRequest(projectId, body), {
        params: Promise.resolve({ "project-id": projectId }),
      });
      const firstEdge = (await first.json()) as EntityRelationshipEdge;

      const second = await POST(makePostRequest(projectId, body), {
        params: Promise.resolve({ "project-id": projectId }),
      });
      expect([200, 201]).toContain(second.status);
      const secondEdge = (await second.json()) as EntityRelationshipEdge;
      expect(secondEdge).toEqual(firstEdge);

      const listRes = await GET(makeGetRequest(projectId), {
        params: Promise.resolve({ "project-id": projectId }),
      });
      const listed = (await listRes.json()) as EntityRelationshipEdge[];
      expect(listed).toHaveLength(1);
    });
  });

  it("returns 400 with no edge persisted when sourceEntityId === targetEntityId", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const res = await POST(
        makePostRequest(projectId, {
          sourceEntityId: SOURCE_ID,
          targetEntityId: SOURCE_ID,
          relationshipType: "ally",
        }),
        { params: Promise.resolve({ "project-id": projectId }) },
      );
      expect(res.status).toBe(400);

      const listRes = await GET(makeGetRequest(projectId), {
        params: Promise.resolve({ "project-id": projectId }),
      });
      const listed = (await listRes.json()) as EntityRelationshipEdge[];
      expect(listed).toEqual([]);
    });
  });

  it("returns 400 with no edge persisted when relationshipType is invalid", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDir(["ally"]);
    await withProjectsDirEnv(projectsDir, async () => {
      const res = await POST(
        makePostRequest(projectId, {
          sourceEntityId: SOURCE_ID,
          targetEntityId: TARGET_ID,
          relationshipType: "nemesis",
        }),
        { params: Promise.resolve({ "project-id": projectId }) },
      );
      expect(res.status).toBe(400);

      const listRes = await GET(makeGetRequest(projectId), {
        params: Promise.resolve({ "project-id": projectId }),
      });
      const listed = (await listRes.json()) as EntityRelationshipEdge[];
      expect(listed).toEqual([]);
    });
  });

  it("returns the uniform 400 when project-id is not a well-formed UUID", async () => {
    const { projectsDir } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const res = await POST(
        makePostRequest("not-a-uuid", {
          sourceEntityId: SOURCE_ID,
          targetEntityId: TARGET_ID,
          relationshipType: "ally",
        }),
        { params: Promise.resolve({ "project-id": "not-a-uuid" }) },
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid projectId");
    });
  });
});

describe("POST /api/project/[project-id]/entity-relationships/remove", () => {
  it("returns success for an existing edge id", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const createRes = await POST(
        makePostRequest(projectId, {
          sourceEntityId: SOURCE_ID,
          targetEntityId: TARGET_ID,
          relationshipType: "ally",
        }),
        { params: Promise.resolve({ "project-id": projectId }) },
      );
      const created = (await createRes.json()) as EntityRelationshipEdge;

      const removeRes = await REMOVE(
        makeRemoveRequest(projectId, { edgeId: created.id }),
        { params: Promise.resolve({ "project-id": projectId }) },
      );
      expect(removeRes.status).toBe(200);
      const json = await removeRes.json();
      expect(json.removed).toBe(true);

      const listRes = await GET(makeGetRequest(projectId), {
        params: Promise.resolve({ "project-id": projectId }),
      });
      const listed = (await listRes.json()) as EntityRelationshipEdge[];
      expect(listed).toEqual([]);
    });
  });

  it("returns a not-found-style response for a nonexistent edge id, without throwing", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const removeRes = await REMOVE(
        makeRemoveRequest(projectId, {
          edgeId: "44444444-4444-4444-8444-444444444444",
        }),
        { params: Promise.resolve({ "project-id": projectId }) },
      );
      expect(removeRes.status).toBe(200);
      const json = await removeRes.json();
      expect(json.removed).toBe(false);
    });
  });

  it("returns the uniform 400 when project-id is not a well-formed UUID", async () => {
    const { projectsDir } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const res = await REMOVE(
        makeRemoveRequest("not-a-uuid", { edgeId: "any" }),
        { params: Promise.resolve({ "project-id": "not-a-uuid" }) },
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid projectId");
    });
  });
});
