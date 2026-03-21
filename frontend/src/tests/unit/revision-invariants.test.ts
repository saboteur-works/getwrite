import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "../../../src/lib/models/memoryAdapter";
import { setStorageAdapter } from "../../../src/lib/models/io";
import { generateUUID } from "../../../src/lib/models/uuid";
import type { Revision } from "../../../src/lib/models/types";
import {
    writeRevision,
    listRevisions,
    pruneRevisions,
    getCanonicalRevision,
    selectPruneCandidates,
    setCanonicalRevision,
} from "../../../src/lib/models/revision";

describe("revision invariants (T014)", () => {
    beforeEach(() => {
        const mem = createMemoryAdapter();
        setStorageAdapter(mem);
    });

    it("ensures a canonical revision can be observed", async () => {
        const projectRoot = "/proj-" + generateUUID();
        const resourceId = generateUUID();

        await writeRevision(projectRoot, resourceId, 1, "one");
        await writeRevision(projectRoot, resourceId, 2, "two", {
            isCanonical: true,
        });
        await writeRevision(projectRoot, resourceId, 3, "three");

        const canonical = await getCanonicalRevision(projectRoot, resourceId);
        expect(canonical).not.toBeNull();
        expect(canonical!.versionNumber).toBe(2);
    });

    it("prune does not delete the canonical revision", async () => {
        const projectRoot = "/proj-" + generateUUID();
        const resourceId = generateUUID();

        // create 4 revisions, mark v4 canonical
        await writeRevision(projectRoot, resourceId, 1, "one");
        await writeRevision(projectRoot, resourceId, 2, "two");
        await writeRevision(projectRoot, resourceId, 3, "three");
        await writeRevision(projectRoot, resourceId, 4, "four", {
            isCanonical: true,
        });

        // prune to max 1 -> should attempt to remove 3; canonical v4 must remain
        const deleted = await pruneRevisions(projectRoot, resourceId, 1);
        const deletedVersions = deleted.map((d) => d.versionNumber);
        expect(deletedVersions).not.toContain(4);

        const remaining = await listRevisions(projectRoot, resourceId);
        const remainingVersions = remaining.map((r) => r.versionNumber);
        expect(remainingVersions).toContain(4);
    });

    it("reassigns canonical ownership without changing revision order", async () => {
        const projectRoot = "/proj-" + generateUUID();
        const resourceId = generateUUID();

        await writeRevision(projectRoot, resourceId, 3, "three");
        await writeRevision(projectRoot, resourceId, 1, "one", {
            isCanonical: true,
        });
        await writeRevision(projectRoot, resourceId, 2, "two");

        const updated = await setCanonicalRevision(projectRoot, resourceId, 3);
        expect(updated?.versionNumber).toBe(3);

        const revisions = await listRevisions(projectRoot, resourceId);
        expect(revisions.map((revision) => revision.versionNumber)).toEqual([
            1, 2, 3,
        ]);
        expect(
            revisions.filter((revision) => revision.isCanonical),
        ).toHaveLength(1);
        expect(
            revisions.find((revision) => revision.isCanonical)?.versionNumber,
        ).toBe(3);
    });

    it("signals when pruning cannot reach target because canonical must be preserved (prompt simulation)", () => {
        // Build a small revisions set where canonical prevents removing enough items
        const revs: Revision[] = [
            {
                id: generateUUID(),
                resourceId: generateUUID(),
                versionNumber: 1,
                createdAt: new Date().toISOString(),
                filePath: "/tmp/v-1/content.bin",
                isCanonical: true,
            },
            {
                id: generateUUID(),
                resourceId: generateUUID(),
                versionNumber: 2,
                createdAt: new Date().toISOString(),
                filePath: "/tmp/v-2/content.bin",
                isCanonical: false,
            },
        ];

        const maxRevisions = 0; // requires removing 2 items (total 2 -> remove 2)
        const candidates = selectPruneCandidates(revs, maxRevisions);
        const toRemoveCount = revs.length - maxRevisions;

        // Because one revision is canonical, candidates length will be < toRemoveCount
        expect(candidates.length).toBeLessThan(toRemoveCount);
    });

    it("aborts prune when autoPrune is disabled and canonical capacity blocks deletion", async () => {
        const projectRoot = "/proj-" + generateUUID();
        const resourceId = generateUUID();

        await writeRevision(projectRoot, resourceId, 1, "one", {
            isCanonical: true,
        });
        await writeRevision(projectRoot, resourceId, 2, "two", {
            metadata: { preserve: true },
        });

        const deleted = await pruneRevisions(projectRoot, resourceId, 0, {
            autoPrune: false,
        });

        expect(deleted).toEqual([]);
        expect(await listRevisions(projectRoot, resourceId)).toHaveLength(2);
    });
});
