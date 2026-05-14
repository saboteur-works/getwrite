import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter } from "../../src/lib/models/io";
import { generateUUID } from "../../src/lib/models/uuid";
import { writeRevision, listRevisions } from "../../src/lib/models/revision";
import { POST, DELETE } from "../../app/api/resource/revision/[resource-id]/route";

function makeRequest(method: string, body: object): NextRequest {
    return new NextRequest(
        "http://localhost/api/resource/revision/test",
        {
            method,
            body: JSON.stringify(body),
            headers: { "Content-Type": "application/json" },
        },
    );
}

describe("revision route canonical guards (T014-C)", () => {
    beforeEach(() => {
        setStorageAdapter(createMemoryAdapter());
    });

    describe("POST — single-canonical invariant", () => {
        it("creating a revision with isCanonical:true clears the old canonical", async () => {
            const projectPath = "/proj-" + generateUUID();
            const resourceId = generateUUID();

            await writeRevision(projectPath, resourceId, 1, "first", {
                isCanonical: true,
            });

            const req = makeRequest("POST", {
                projectPath,
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

    describe("DELETE — canonical guard", () => {
        it("returns 400 when deleting the canonical revision", async () => {
            const projectPath = "/proj-" + generateUUID();
            const resourceId = generateUUID();

            const canonical = await writeRevision(
                projectPath,
                resourceId,
                1,
                "content",
                { isCanonical: true },
            );

            const req = makeRequest("DELETE", {
                projectPath,
                revisionId: canonical.id,
            });
            const res = await DELETE(req, {
                params: Promise.resolve({ "resource-id": resourceId }),
            });

            expect(res.status).toBe(400);
            const body = (await res.json()) as { error: string };
            expect(body.error).toMatch(/canonical/i);
        });

        it("returns 400 when the only revision is canonical", async () => {
            const projectPath = "/proj-" + generateUUID();
            const resourceId = generateUUID();

            const revision = await writeRevision(
                projectPath,
                resourceId,
                1,
                "only",
                { isCanonical: true },
            );

            const req = makeRequest("DELETE", {
                projectPath,
                revisionId: revision.id,
            });
            const res = await DELETE(req, {
                params: Promise.resolve({ "resource-id": resourceId }),
            });

            expect(res.status).toBe(400);
        });

        it("returns 200 when deleting a non-canonical revision", async () => {
            const projectPath = "/proj-" + generateUUID();
            const resourceId = generateUUID();

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
                projectPath,
                revisionId: nonCanonical.id,
            });
            const res = await DELETE(req, {
                params: Promise.resolve({ "resource-id": resourceId }),
            });

            expect(res.status).toBe(200);
        });

        it("exactly one canonical remains after deleting a non-canonical", async () => {
            const projectPath = "/proj-" + generateUUID();
            const resourceId = generateUUID();

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
                projectPath,
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
});
