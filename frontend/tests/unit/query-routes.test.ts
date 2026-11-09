/**
 * Smoke tests for the query API routes.
 *
 * Evaluate tests call executeEvaluate() directly against a real tmp filesystem
 * project, plus a few HTTP-level validation cases via the POST handler.
 *
 * Saved-query tests call the POST handler directly via NextRequest to exercise
 * each action end-to-end.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { writeSidecar } from "../../src/lib/models/sidecar";
import { generateUUID } from "../../src/lib/models/uuid";
import {
  createFolderResource,
  writeResourceToFile,
} from "../../src/lib/models/resource";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { ProjectLockedError } from "../../src/lib/models/crypto/adapter-selection";

// Feature 54, Task 16: partial mocks so a single test per route can force its
// underlying core function to reject with a locked-access error, while every
// other test in this file keeps exercising the real implementation.
vi.mock("../../src/lib/models/query-evaluate-core", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/models/query-evaluate-core")
  >("../../src/lib/models/query-evaluate-core");
  return { ...actual, executeEvaluate: vi.fn(actual.executeEvaluate) };
});
vi.mock("../../src/lib/models/saved-query-dispatch-core", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/models/saved-query-dispatch-core")
  >("../../src/lib/models/saved-query-dispatch-core");
  return {
    ...actual,
    dispatchSavedQueryAction: vi.fn(actual.dispatchSavedQueryAction),
  };
});

import {
  executeEvaluate,
  POST as evaluatePOST,
} from "../../app/api/project/query/evaluate/route";
import { POST as savedPOST } from "../../app/api/project/query/saved/route";
import { dispatchSavedQueryAction } from "../../src/lib/models/saved-query-dispatch-core";
import type { SavedQuery } from "../../src/lib/models/saved-queries";
import { writeQuery } from "../../src/lib/models/saved-queries";
import type { QueryAST } from "../../src/lib/models/query-ast";

// ─── Test project helpers ─────────────────────────────────────────────────────

const tmpDirs: string[] = [];

async function makeTmpProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-query-routes-"));
  tmpDirs.push(dir);
  const proj = createProject({ name: "query-test" });
  await fs.writeFile(
    path.join(dir, PROJECT_FILENAME),
    JSON.stringify(proj, null, 2),
    "utf8",
  );
  return dir;
}

/**
 * Adds a resource to the project: creates resources/<id>/ and writes a sidecar.
 * Returns the resource ID.
 */
async function addResource(
  projectRoot: string,
  fields: {
    type?: string;
    name?: string;
    status?: string;
    [key: string]: unknown;
  },
): Promise<string> {
  const id = generateUUID();
  await fs.mkdir(path.join(projectRoot, "resources", id), { recursive: true });
  await writeSidecar(projectRoot, id, {
    id,
    name: fields.name ?? "Untitled",
    type: fields.type ?? "text",
    slug: (fields.name ?? "untitled").toLowerCase().replace(/\s+/g, "-"),
    orderIndex: 0,
    createdAt: new Date().toISOString(),
    folderId: null,
    ...(fields.status ? { statuses: [fields.status] } : {}),
    ...Object.fromEntries(
      Object.entries(fields).filter(
        ([k]) => !["type", "name", "status"].includes(k),
      ),
    ),
  } as Record<string, unknown> as Record<
    string,
    import("../../src/lib/models/types").MetadataValue
  >);
  return id;
}

afterEach(async () => {
  await flushIndexer();
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

/**
 * Creates a projects directory containing a single UUID-named project, for
 * exercising the projectId-based route handlers (which resolve `projectId`
 * against `GETWRITE_PROJECTS_DIR` rather than accepting a raw path).
 */
async function makeTmpProjectsDirProject(): Promise<{
  projectsDir: string;
  projectId: string;
  root: string;
}> {
  const projectsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-query-routes-dir-"),
  );
  const projectId = generateUUID();
  const root = path.join(projectsDir, projectId);
  await fs.mkdir(root, { recursive: true });
  const proj = createProject({ name: "query-test" });
  await fs.writeFile(
    path.join(root, PROJECT_FILENAME),
    JSON.stringify(proj, null, 2),
    "utf8",
  );
  return { projectsDir, projectId, root };
}

/**
 * Runs `fn` with `GETWRITE_PROJECTS_DIR` pointed at `projectsDir`, restoring
 * the previous value and removing `projectsDir` afterward.
 */
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
    await fs.rm(projectsDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── evaluate route — executeEvaluate helper ──────────────────────────────────

describe("executeEvaluate — happy path", () => {
  it("returns the IDs of all matching resources", async () => {
    const root = await makeTmpProject();
    const id1 = await addResource(root, { type: "text", name: "Scene One" });
    const id2 = await addResource(root, { type: "image", name: "Photo" });

    const ids = await executeEvaluate(root, {
      op: "eq",
      field: "type",
      value: "text",
    });

    expect(ids).toContain(id1);
    expect(ids).not.toContain(id2);
  });

  it("returns all resource IDs for a tautological AST (empty and)", async () => {
    const root = await makeTmpProject();
    const id1 = await addResource(root, { name: "A" });
    const id2 = await addResource(root, { name: "B" });

    const ids = await executeEvaluate(root, { op: "and", children: [] });

    expect(ids).toContain(id1);
    expect(ids).toContain(id2);
  });

  it("returns [] when no resources exist", async () => {
    const root = await makeTmpProject();
    const ids = await executeEvaluate(root, {
      op: "eq",
      field: "type",
      value: "text",
    });
    expect(ids).toEqual([]);
  });

  it("derives wordCount / charCount from content.txt, not a stale sidecar", async () => {
    // Mirrors a content-only save: content.txt holds the real text while the
    // sidecar's cached wordCount is stale (0). Regression test for wordCount /
    // charCount predicates silently matching nothing.
    const root = await makeTmpProject();
    const id = generateUUID();
    await fs.mkdir(path.join(root, "resources", id), { recursive: true });
    await writeSidecar(root, id, {
      id,
      name: "Long Scene",
      type: "text",
      slug: "long-scene",
      orderIndex: 0,
      createdAt: new Date().toISOString(),
      folderId: null,
      wordCount: 0, // stale — must be ignored in favour of content.txt
    } as Record<string, import("../../src/lib/models/types").MetadataValue>);
    const text = "one two three four five six seven eight nine ten"; // 10 words
    await fs.writeFile(
      path.join(root, "resources", id, "content.txt"),
      text,
      "utf8",
    );

    expect(
      await executeEvaluate(root, { op: "gte", field: "wordCount", value: 5 }),
    ).toContain(id);
    expect(
      await executeEvaluate(root, { op: "gte", field: "wordCount", value: 50 }),
    ).not.toContain(id);
    expect(
      await executeEvaluate(root, {
        op: "gte",
        field: "charCount",
        value: text.length,
      }),
    ).toContain(id);
  });

  it("evaluates an exists predicate against a sidecar field", async () => {
    const root = await makeTmpProject();
    const idWith = await addResource(root, { name: "Has pov", pov: "mara" });
    const idWithout = await addResource(root, { name: "No pov" });

    const ids = await executeEvaluate(root, { op: "exists", field: "pov" });

    expect(ids).toContain(idWith);
    expect(ids).not.toContain(idWithout);
  });

  it("evaluates a field nested inside userMetadata", async () => {
    const root = await makeTmpProject();
    const id1 = generateUUID();
    const id2 = generateUUID();
    await fs.mkdir(path.join(root, "resources", id1), { recursive: true });
    await fs.mkdir(path.join(root, "resources", id2), { recursive: true });
    // Write sidecars as the real app does: user fields nested under userMetadata
    await writeSidecar(root, id1, {
      id: id1,
      name: "Scene A",
      type: "text",
      slug: "scene-a",
      orderIndex: 0,
      createdAt: new Date().toISOString(),
      folderId: null,
      userMetadata: { status: "Draft", characters: ["Alice"] },
    } as Record<string, import("../../src/lib/models/types").MetadataValue>);
    await writeSidecar(root, id2, {
      id: id2,
      name: "Scene B",
      type: "text",
      slug: "scene-b",
      orderIndex: 1,
      createdAt: new Date().toISOString(),
      folderId: null,
      userMetadata: { status: "Polished" },
    } as Record<string, import("../../src/lib/models/types").MetadataValue>);

    const ids = await executeEvaluate(root, {
      op: "eq",
      field: "status",
      value: "Draft",
    });

    expect(ids).toContain(id1);
    expect(ids).not.toContain(id2);
  });

  it("evaluates an or combinator", async () => {
    const root = await makeTmpProject();
    const idText = await addResource(root, { type: "text", name: "T" });
    const idImage = await addResource(root, { type: "image", name: "I" });
    const idAudio = await addResource(root, { type: "audio", name: "A" });

    const ids = await executeEvaluate(root, {
      op: "or",
      children: [
        { op: "eq", field: "type", value: "text" },
        { op: "eq", field: "type", value: "image" },
      ],
    });

    expect(ids).toContain(idText);
    expect(ids).toContain(idImage);
    expect(ids).not.toContain(idAudio);
  });
});

describe("executeEvaluate — folder source (Feature 102 FR-13)", () => {
  /** A project with two folders on disk and two text resources (one in a folder). */
  async function seedFolderProject(): Promise<{
    root: string;
    folderA: string;
    folderB: string;
    folderIds: string[];
    textIds: string[];
  }> {
    const root = await makeTmpProject();
    const a = createFolderResource({ name: "Folder A" });
    const b = createFolderResource({ name: "Folder B", parentFolderId: a.id });
    await writeResourceToFile(root, a);
    await writeResourceToFile(root, b);
    const t1 = await addResource(root, { type: "text", name: "Loose Text" });
    const t2 = await addResource(root, {
      type: "text",
      name: "Filed Text",
      folderId: a.id,
    });
    return {
      root,
      folderA: a.id,
      folderB: b.id,
      folderIds: [a.id, b.id],
      textIds: [t1, t2],
    };
  }

  async function writeFolderSidecar(
    root: string,
    folderId: string,
    body: string,
  ): Promise<void> {
    await fs.mkdir(path.join(root, "meta"), { recursive: true });
    await fs.writeFile(
      path.join(root, "meta", `folder-${folderId}.meta.json`),
      body,
      "utf8",
    );
  }

  const typeIs = (value: string): QueryAST => ({
    op: "eq",
    field: "type",
    value,
  });
  const sorted = (ids: string[]): string[] => [...ids].sort();

  it("type = folder matches the project's folders", async () => {
    const { root, folderIds } = await seedFolderProject();
    expect(sorted(await executeEvaluate(root, typeIs("folder")))).toEqual(
      sorted(folderIds),
    );
  });

  it("type in [folder] and type != folder name the folder type too", async () => {
    const { root, folderIds, textIds } = await seedFolderProject();
    expect(
      sorted(
        await executeEvaluate(root, {
          op: "in",
          field: "type",
          value: ["folder"],
        }),
      ),
    ).toEqual(sorted(folderIds));
    expect(
      sorted(
        await executeEvaluate(root, {
          op: "ne",
          field: "type",
          value: "folder",
        }),
      ),
    ).toEqual(sorted(textIds));
  });

  it("filters folders by field value and subtype through the existing language", async () => {
    const { root, folderA, folderB } = await seedFolderProject();
    await writeFolderSidecar(
      root,
      folderA,
      JSON.stringify({
        userMetadata: { notes: "n", mood: "tense" },
        resourceSubtype: "Act",
      }),
    );
    await writeFolderSidecar(
      root,
      folderB,
      JSON.stringify({ userMetadata: { mood: "calm" } }),
    );
    const folderAnd = (child: QueryAST): QueryAST => ({
      op: "and",
      children: [typeIs("folder"), child],
    });

    expect(
      await executeEvaluate(
        root,
        folderAnd({ op: "eq", field: "mood", value: "tense" }),
      ),
    ).toEqual([folderA]);
    expect(
      await executeEvaluate(
        root,
        folderAnd({ op: "eq", field: "mood", value: "calm" }),
      ),
    ).toEqual([folderB]);
    expect(
      await executeEvaluate(
        root,
        folderAnd({ op: "eq", field: "resourceSubtype", value: "Act" }),
      ),
    ).toEqual([folderA]);
    expect(
      await executeEvaluate(root, folderAnd({ op: "exists", field: "mood" })),
    ).toHaveLength(2);
  });

  it("a folder with no sidecar is a folder with no field values and no subtype", async () => {
    const { root, folderIds } = await seedFolderProject();
    expect(
      await executeEvaluate(root, {
        op: "and",
        children: [typeIs("folder"), { op: "exists", field: "mood" }],
      }),
    ).toEqual([]);
    expect(sorted(await executeEvaluate(root, typeIs("folder")))).toEqual(
      sorted(folderIds),
    );
  });

  it("pins the mixed-type results: OR is the union, AND is empty (Task 3 record)", async () => {
    const { root, folderIds, textIds } = await seedFolderProject();
    const folderOrText = await executeEvaluate(root, {
      op: "or",
      children: [typeIs("folder"), typeIs("text")],
    });
    const folderAndText = await executeEvaluate(root, {
      op: "and",
      children: [typeIs("folder"), typeIs("text")],
    });
    expect(sorted(folderOrText)).toEqual(sorted([...folderIds, ...textIds]));
    expect(folderAndText).toEqual([]);
  });

  it("type = text and not(type = text), which do not name folder, never return folders", async () => {
    const { root, textIds } = await seedFolderProject();
    expect(sorted(await executeEvaluate(root, typeIs("text")))).toEqual(
      sorted(textIds),
    );
    expect(
      await executeEvaluate(root, { op: "not", child: typeIs("text") }),
    ).toEqual([]);
  });

  it("not(type = folder) names the folder type and returns the non-folders", async () => {
    const { root, textIds } = await seedFolderProject();
    expect(
      sorted(
        await executeEvaluate(root, { op: "not", child: typeIs("folder") }),
      ),
    ).toEqual(sorted(textIds));
  });

  it("a ref to a saved query that names type = folder loads the folder source", async () => {
    const { root, folderIds } = await seedFolderProject();
    const queryId = generateUUID();
    await writeQuery(root, {
      id: queryId,
      name: "Folders",
      definition: typeIs("folder"),
    });
    expect(
      sorted(await executeEvaluate(root, { op: "ref", id: queryId })),
    ).toEqual(sorted(folderIds));
  });

  it("a query that does not name the folder type is unchanged by folders and never reads folder sidecars", async () => {
    const { root, folderA, textIds } = await seedFolderProject();
    // A corrupt folder sidecar must not affect a query that does not name it.
    await writeFolderSidecar(root, folderA, "{ not json");
    const corpus: QueryAST[] = [
      typeIs("text"),
      { op: "not", child: typeIs("text") },
      { op: "exists", field: "status" },
      { op: "contains", field: "name", value: "Text" },
      { op: "eq", field: "folderId", value: folderA },
      {
        op: "or",
        children: [
          typeIs("text"),
          { op: "eq", field: "resourceSubtype", value: "Act" },
        ],
      },
      { op: "gte", field: "wordCount", value: 0 },
    ];
    const results: string[][] = [];
    for (const ast of corpus) results.push(await executeEvaluate(root, ast));

    expect(sorted(results[0])).toEqual(sorted(textIds));
    expect(results[1]).toEqual([]);
    expect(results[2]).toEqual([]);
    expect(sorted(results[3])).toEqual(sorted(textIds));
    expect(results[4]).toEqual([textIds[1]]);
    expect(sorted(results[5])).toEqual(sorted(textIds));
    expect(results[6].every((id) => textIds.includes(id))).toBe(true);
  });

  it("a failed folder sidecar read raises and is not returned as no folders", async () => {
    const { root, folderA } = await seedFolderProject();
    await writeFolderSidecar(root, folderA, "{ not json");
    await expect(executeEvaluate(root, typeIs("folder"))).rejects.toThrow(
      /folder/i,
    );
  });

  it("an unparseable folder.json raises when the query names the folder type", async () => {
    const { root, folderA } = await seedFolderProject();
    for (const d of await fs.readdir(path.join(root, "folders"))) {
      const p = path.join(root, "folders", d, "folder.json");
      const raw = JSON.parse(await fs.readFile(p, "utf8")) as { id: string };
      if (raw.id === folderA) await fs.writeFile(p, "{ broken", "utf8");
    }
    await expect(executeEvaluate(root, typeIs("folder"))).rejects.toThrow();
  });

  it("a project with no folders directory returns no folders without error", async () => {
    const root = await makeTmpProject();
    await addResource(root, { name: "Only" });
    expect(await executeEvaluate(root, typeIs("folder"))).toEqual([]);
  });
});

describe("executeEvaluate — Inbox item is an ordinary resource (Feature 106, FR-16)", () => {
  /**
   * A project whose `config.inboxFolderId` names a folder on disk, with one
   * text resource filed in that folder and one outside it. The module under
   * test is given no Inbox flag.
   */
  async function seedInboxProject(): Promise<{
    root: string;
    inboxId: string;
    itemId: string;
    otherId: string;
  }> {
    const root = await makeTmpProject();
    const inbox = createFolderResource({ name: "Inbox" });
    await writeResourceToFile(root, inbox);
    const projectPath = path.join(root, PROJECT_FILENAME);
    const project = JSON.parse(await fs.readFile(projectPath, "utf8")) as {
      config?: Record<string, unknown>;
    };
    project.config = { ...(project.config ?? {}), inboxFolderId: inbox.id };
    await fs.writeFile(projectPath, JSON.stringify(project, null, 2), "utf8");
    const itemId = await addResource(root, {
      type: "text",
      name: "Captured note",
      folderId: inbox.id,
    });
    const otherId = await addResource(root, {
      type: "text",
      name: "Loose scene",
    });
    return { root, inboxId: inbox.id, itemId, otherId };
  }

  it("a Data view query on a field the item has matches it, with a control outside the Inbox left out", async () => {
    const { root, itemId, otherId } = await seedInboxProject();
    const ids = await executeEvaluate(root, {
      op: "eq",
      field: "name",
      value: "Captured note",
    });
    expect(ids).toEqual([itemId]);
    expect(ids).not.toContain(otherId);
  });

  it("a Data view query on the Inbox folder id matches the filed item like any folder", async () => {
    const { root, inboxId, itemId, otherId } = await seedInboxProject();
    const ids = await executeEvaluate(root, {
      op: "eq",
      field: "folderId",
      value: inboxId,
    });
    expect(ids).toEqual([itemId]);
    expect(ids).not.toContain(otherId);
  });

  it("a smart folder (saved query, reached by ref) returns the item", async () => {
    const { root, itemId, otherId } = await seedInboxProject();
    const saved: SavedQuery = {
      id: "7a1c0d9e-3b5f-4e21-8c44-0f6a2b9d1e77",
      name: "Captured notes",
      definition: { op: "eq", field: "name", value: "Captured note" },
    };
    await writeQuery(root, saved);
    const ids = await executeEvaluate(root, { op: "ref", id: saved.id });
    expect(ids).toEqual([itemId]);
    expect(ids).not.toContain(otherId);
  });
});

describe("executeEvaluate — error cases", () => {
  it("throws when a ref target does not exist", async () => {
    const root = await makeTmpProject();
    await addResource(root, { name: "A" });

    await expect(
      executeEvaluate(root, {
        op: "ref",
        id: "550e8400-e29b-41d4-a716-000000000000",
      }),
    ).rejects.toThrow(/not found/i);
  });
});

// ─── evaluate route — POST handler ────────────────────────────────────────────

describe("POST /api/project/query/evaluate — validation", () => {
  it("returns 400 when the request body is not valid JSON", async () => {
    const req = new NextRequest("http://localhost/api/project/query/evaluate", {
      method: "POST",
      body: "{ bad json",
      headers: { "content-type": "application/json" },
    });
    const res = await evaluatePOST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/invalid/i);
  });

  it("returns 400 when definition is missing", async () => {
    const req = new NextRequest("http://localhost/api/project/query/evaluate", {
      method: "POST",
      body: JSON.stringify({ projectId: generateUUID() }),
      headers: { "content-type": "application/json" },
    });
    const res = await evaluatePOST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when definition is not a valid AST", async () => {
    const req = new NextRequest("http://localhost/api/project/query/evaluate", {
      method: "POST",
      body: JSON.stringify({
        projectId: generateUUID(),
        definition: { op: "not-an-op" },
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await evaluatePOST(req);
    expect(res.status).toBe(400);
  });

  it("returns the uniform 400 when projectId is not a well-formed UUID", async () => {
    const req = new NextRequest("http://localhost/api/project/query/evaluate", {
      method: "POST",
      body: JSON.stringify({
        projectId: "../../etc/passwd",
        definition: { op: "eq", field: "type", value: "text" },
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await evaluatePOST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid projectId");
  });

  it("returns 200 with ids array for a valid request against a real project", async () => {
    const { projectsDir, projectId, root } = await makeTmpProjectsDirProject();
    const idA = await addResource(root, { type: "text", name: "Alpha" });
    await addResource(root, { type: "image", name: "Beta" });

    await withProjectsDirEnv(projectsDir, async () => {
      const req = new NextRequest(
        "http://localhost/api/project/query/evaluate",
        {
          method: "POST",
          body: JSON.stringify({
            projectId,
            definition: { op: "eq", field: "type", value: "text" },
          }),
          headers: { "content-type": "application/json" },
        },
      );
      const res = await evaluatePOST(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ids: string[] };
      expect(body.ids).toContain(idA);
      expect(body.ids).toHaveLength(1);
    });
  });

  it("maps a ProjectLockedError from executeEvaluate to 401 instead of the route's fixed 500 shape (Feature 54, Task 16)", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDirProject();
    await withProjectsDirEnv(projectsDir, async () => {
      vi.mocked(executeEvaluate).mockRejectedValueOnce(
        new ProjectLockedError(projectId),
      );

      const req = new NextRequest(
        "http://localhost/api/project/query/evaluate",
        {
          method: "POST",
          body: JSON.stringify({
            projectId,
            definition: { op: "eq", field: "type", value: "text" },
          }),
          headers: { "content-type": "application/json" },
        },
      );
      const res = await evaluatePOST(req);
      expect(res.status).toBe(401);
    });
  });
});

// ─── saved route — POST handler actions ──────────────────────────────────────

const SAMPLE_QUERY: SavedQuery = {
  id: "550e8400-e29b-41d4-a716-446655440099",
  name: "All text resources",
  definition: { op: "eq", field: "type", value: "text" },
};

function savedRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/project/query/saved", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/project/query/saved — list action", () => {
  it("returns an empty array when no queries exist", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDirProject();
    await withProjectsDirEnv(projectsDir, async () => {
      const res = await savedPOST(savedRequest({ action: "list", projectId }));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { queries: SavedQuery[] };
      expect(body.queries).toEqual([]);
    });
  });

  it("returns queries after they have been written", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDirProject();
    await withProjectsDirEnv(projectsDir, async () => {
      await savedPOST(
        savedRequest({ action: "write", projectId, query: SAMPLE_QUERY }),
      );
      const res = await savedPOST(savedRequest({ action: "list", projectId }));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { queries: SavedQuery[] };
      expect(body.queries).toHaveLength(1);
      expect(body.queries[0]!.id).toBe(SAMPLE_QUERY.id);
    });
  });
});

describe("POST /api/project/query/saved — read action", () => {
  it("returns null when the query does not exist", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDirProject();
    await withProjectsDirEnv(projectsDir, async () => {
      const res = await savedPOST(
        savedRequest({ action: "read", projectId, id: SAMPLE_QUERY.id }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { query: SavedQuery | null };
      expect(body.query).toBeNull();
    });
  });

  it("returns the query after it has been written", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDirProject();
    await withProjectsDirEnv(projectsDir, async () => {
      await savedPOST(
        savedRequest({ action: "write", projectId, query: SAMPLE_QUERY }),
      );
      const res = await savedPOST(
        savedRequest({ action: "read", projectId, id: SAMPLE_QUERY.id }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { query: SavedQuery };
      expect(body.query.name).toBe(SAMPLE_QUERY.name);
    });
  });
});

describe("POST /api/project/query/saved — write action", () => {
  it("persists a valid query and returns it", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDirProject();
    await withProjectsDirEnv(projectsDir, async () => {
      const res = await savedPOST(
        savedRequest({ action: "write", projectId, query: SAMPLE_QUERY }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { query: SavedQuery };
      expect(body.query.id).toBe(SAMPLE_QUERY.id);
      expect(body.query.name).toBe(SAMPLE_QUERY.name);
    });
  });

  it("returns 400 when the query fails schema validation", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDirProject();
    await withProjectsDirEnv(projectsDir, async () => {
      const res = await savedPOST(
        savedRequest({
          action: "write",
          projectId,
          query: { id: "not-a-uuid", name: "", definition: null },
        }),
      );
      expect(res.status).toBe(400);
    });
  });
});

describe("POST /api/project/query/saved — delete action", () => {
  it("returns deleted: false when the query does not exist", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDirProject();
    await withProjectsDirEnv(projectsDir, async () => {
      const res = await savedPOST(
        savedRequest({ action: "delete", projectId, id: SAMPLE_QUERY.id }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { deleted: boolean };
      expect(body.deleted).toBe(false);
    });
  });

  it("returns deleted: true after deleting an existing query", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDirProject();
    await withProjectsDirEnv(projectsDir, async () => {
      await savedPOST(
        savedRequest({ action: "write", projectId, query: SAMPLE_QUERY }),
      );
      const res = await savedPOST(
        savedRequest({ action: "delete", projectId, id: SAMPLE_QUERY.id }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { deleted: boolean };
      expect(body.deleted).toBe(true);
    });
  });
});

describe("POST /api/project/query/saved — invalid requests", () => {
  it("returns 400 for an unknown action", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDirProject();
    await withProjectsDirEnv(projectsDir, async () => {
      const res = await savedPOST(
        savedRequest({ action: "upsert", projectId }),
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/invalid action/i);
    });
  });

  it("returns 400 when request body is not valid JSON", async () => {
    const req = new NextRequest("http://localhost/api/project/query/saved", {
      method: "POST",
      body: "not json",
      headers: { "content-type": "application/json" },
    });
    const res = await savedPOST(req);
    expect(res.status).toBe(400);
  });

  it("returns the uniform 400 when projectId is not a well-formed UUID", async () => {
    const res = await savedPOST(
      savedRequest({ action: "list", projectId: "not-a-uuid" }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid projectId");
  });

  it("maps a ProjectLockedError from dispatchSavedQueryAction to 401 instead of the route's fixed 500 shape (Feature 54, Task 16)", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDirProject();
    await withProjectsDirEnv(projectsDir, async () => {
      vi.mocked(dispatchSavedQueryAction).mockRejectedValueOnce(
        new ProjectLockedError(projectId),
      );

      const res = await savedPOST(savedRequest({ action: "list", projectId }));
      expect(res.status).toBe(401);
    });
  });
});
