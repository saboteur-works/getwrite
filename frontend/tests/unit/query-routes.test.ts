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
import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { writeSidecar } from "../../src/lib/models/sidecar";
import { generateUUID } from "../../src/lib/models/uuid";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { executeEvaluate, POST as evaluatePOST } from "../../app/api/project/query/evaluate/route";
import { POST as savedPOST } from "../../app/api/project/query/saved/route";
import type { SavedQuery } from "../../src/lib/models/saved-queries";

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
            Object.entries(fields).filter(([k]) => !["type", "name", "status"].includes(k)),
        ),
    } as Record<string, unknown> as Record<string, import("../../src/lib/models/types").MetadataValue>);
    return id;
}

afterEach(async () => {
    await flushIndexer();
    for (const dir of tmpDirs.splice(0)) {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
});

// ─── evaluate route — executeEvaluate helper ──────────────────────────────────

describe("executeEvaluate — happy path", () => {
    it("returns the IDs of all matching resources", async () => {
        const root = await makeTmpProject();
        const id1 = await addResource(root, { type: "text", name: "Scene One" });
        const id2 = await addResource(root, { type: "image", name: "Photo" });

        const ids = await executeEvaluate(root, { op: "eq", field: "type", value: "text" });

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
        const ids = await executeEvaluate(root, { op: "eq", field: "type", value: "text" });
        expect(ids).toEqual([]);
    });

    it("evaluates an exists predicate against a sidecar field", async () => {
        const root = await makeTmpProject();
        const idWith = await addResource(root, { name: "Has pov", pov: "mara" });
        const idWithout = await addResource(root, { name: "No pov" });

        const ids = await executeEvaluate(root, { op: "exists", field: "pov" });

        expect(ids).toContain(idWith);
        expect(ids).not.toContain(idWithout);
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

describe("executeEvaluate — error cases", () => {
    it("throws EvaluatorNotImplementedError for ref nodes", async () => {
        const root = await makeTmpProject();
        await addResource(root, { name: "A" });

        await expect(
            executeEvaluate(root, { op: "ref", id: "some-saved-query-id" }),
        ).rejects.toThrow("saved-query resolution");
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
        const body = await res.json() as { error: string };
        expect(body.error).toMatch(/invalid/i);
    });

    it("returns 400 when definition is missing", async () => {
        const req = new NextRequest("http://localhost/api/project/query/evaluate", {
            method: "POST",
            body: JSON.stringify({ projectPath: "/tmp/x" }),
            headers: { "content-type": "application/json" },
        });
        const res = await evaluatePOST(req);
        expect(res.status).toBe(400);
    });

    it("returns 400 when definition is not a valid AST", async () => {
        const req = new NextRequest("http://localhost/api/project/query/evaluate", {
            method: "POST",
            body: JSON.stringify({ projectPath: "/tmp/x", definition: { op: "not-an-op" } }),
            headers: { "content-type": "application/json" },
        });
        const res = await evaluatePOST(req);
        expect(res.status).toBe(400);
    });

    it("returns 200 with ids array for a valid request against a real project", async () => {
        const root = await makeTmpProject();
        const idA = await addResource(root, { type: "text", name: "Alpha" });
        await addResource(root, { type: "image", name: "Beta" });

        const req = new NextRequest("http://localhost/api/project/query/evaluate", {
            method: "POST",
            body: JSON.stringify({
                projectPath: root,
                definition: { op: "eq", field: "type", value: "text" },
            }),
            headers: { "content-type": "application/json" },
        });
        const res = await evaluatePOST(req);
        expect(res.status).toBe(200);
        const body = await res.json() as { ids: string[] };
        expect(body.ids).toContain(idA);
        expect(body.ids).toHaveLength(1);
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
        const root = await makeTmpProject();
        const res = await savedPOST(savedRequest({ action: "list", projectPath: root }));
        expect(res.status).toBe(200);
        const body = await res.json() as { queries: SavedQuery[] };
        expect(body.queries).toEqual([]);
    });

    it("returns queries after they have been written", async () => {
        const root = await makeTmpProject();
        await savedPOST(savedRequest({ action: "write", projectPath: root, query: SAMPLE_QUERY }));
        const res = await savedPOST(savedRequest({ action: "list", projectPath: root }));
        expect(res.status).toBe(200);
        const body = await res.json() as { queries: SavedQuery[] };
        expect(body.queries).toHaveLength(1);
        expect(body.queries[0]!.id).toBe(SAMPLE_QUERY.id);
    });
});

describe("POST /api/project/query/saved — read action", () => {
    it("returns null when the query does not exist", async () => {
        const root = await makeTmpProject();
        const res = await savedPOST(savedRequest({ action: "read", projectPath: root, id: SAMPLE_QUERY.id }));
        expect(res.status).toBe(200);
        const body = await res.json() as { query: SavedQuery | null };
        expect(body.query).toBeNull();
    });

    it("returns the query after it has been written", async () => {
        const root = await makeTmpProject();
        await savedPOST(savedRequest({ action: "write", projectPath: root, query: SAMPLE_QUERY }));
        const res = await savedPOST(savedRequest({ action: "read", projectPath: root, id: SAMPLE_QUERY.id }));
        expect(res.status).toBe(200);
        const body = await res.json() as { query: SavedQuery };
        expect(body.query.name).toBe(SAMPLE_QUERY.name);
    });
});

describe("POST /api/project/query/saved — write action", () => {
    it("persists a valid query and returns it", async () => {
        const root = await makeTmpProject();
        const res = await savedPOST(savedRequest({ action: "write", projectPath: root, query: SAMPLE_QUERY }));
        expect(res.status).toBe(200);
        const body = await res.json() as { query: SavedQuery };
        expect(body.query.id).toBe(SAMPLE_QUERY.id);
        expect(body.query.name).toBe(SAMPLE_QUERY.name);
    });

    it("returns 400 when the query fails schema validation", async () => {
        const root = await makeTmpProject();
        const res = await savedPOST(savedRequest({
            action: "write",
            projectPath: root,
            query: { id: "not-a-uuid", name: "", definition: null },
        }));
        expect(res.status).toBe(400);
    });
});

describe("POST /api/project/query/saved — delete action", () => {
    it("returns deleted: false when the query does not exist", async () => {
        const root = await makeTmpProject();
        const res = await savedPOST(savedRequest({ action: "delete", projectPath: root, id: SAMPLE_QUERY.id }));
        expect(res.status).toBe(200);
        const body = await res.json() as { deleted: boolean };
        expect(body.deleted).toBe(false);
    });

    it("returns deleted: true after deleting an existing query", async () => {
        const root = await makeTmpProject();
        await savedPOST(savedRequest({ action: "write", projectPath: root, query: SAMPLE_QUERY }));
        const res = await savedPOST(savedRequest({ action: "delete", projectPath: root, id: SAMPLE_QUERY.id }));
        expect(res.status).toBe(200);
        const body = await res.json() as { deleted: boolean };
        expect(body.deleted).toBe(true);
    });
});

describe("POST /api/project/query/saved — invalid requests", () => {
    it("returns 400 for an unknown action", async () => {
        const root = await makeTmpProject();
        const res = await savedPOST(savedRequest({ action: "upsert", projectPath: root }));
        expect(res.status).toBe(400);
        const body = await res.json() as { error: string };
        expect(body.error).toMatch(/invalid action/i);
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
});
