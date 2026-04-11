import { describe, expect, it } from "vitest";

import revisionsReducer, {
    setCanonicalRevisionForSelectedResource,
    setCanonicalRevisionId,
    type RevisionEntry,
    type RevisionsState,
} from "../../src/store/revisionsSlice";

function createRevisionEntry(overrides: Partial<RevisionEntry>): RevisionEntry {
    const versionNumber = overrides.versionNumber ?? 1;
    const resourceId = overrides.resourceId ?? "resource-1";
    const revisionId = overrides.id ?? `revision-${versionNumber}`;

    return {
        id: revisionId,
        resourceId,
        versionNumber,
        createdAt: `2026-03-21T12:00:0${versionNumber}.000Z`,
        filePath: `/tmp/${revisionId}.json`,
        isCanonical: false,
        displayName: `Revision v${versionNumber}`,
        ...overrides,
    };
}

function createState(revisions: RevisionEntry[]): RevisionsState {
    return {
        resourceId: "resource-1",
        requestedResourceId: null,
        currentRevisionId: revisions[0]?.id ?? null,
        currentRevisionContent: "preview",
        revisions,
        isLoading: false,
        isSaving: false,
        fetchingRevisionId: null,
        deletingRevisionId: null,
        errorMessage: "",
    };
}

describe("store/revisionsSlice canonical guardrails (T008)", () => {
    it("marks exactly one revision canonical when the local reducer updates the active revision", () => {
        const state = createState([
            createRevisionEntry({ id: "revision-1", versionNumber: 1 }),
            createRevisionEntry({
                id: "revision-2",
                versionNumber: 2,
                isCanonical: true,
            }),
            createRevisionEntry({ id: "revision-3", versionNumber: 3 }),
        ]);

        const nextState = revisionsReducer(
            state,
            setCanonicalRevisionId("revision-3"),
        );

        expect(nextState.currentRevisionId).toBe("revision-3");
        expect(
            nextState.revisions.filter((revision) => revision.isCanonical),
        ).toEqual([
            expect.objectContaining({ id: "revision-3", isCanonical: true }),
        ]);
    });

    it("preserves the single-canonical invariant when the async canonical action fulfills", () => {
        const state = createState([
            createRevisionEntry({
                id: "revision-1",
                versionNumber: 1,
                isCanonical: true,
            }),
            createRevisionEntry({ id: "revision-2", versionNumber: 2 }),
            createRevisionEntry({ id: "revision-3", versionNumber: 3 }),
        ]);

        const nextState = revisionsReducer(
            state,
            setCanonicalRevisionForSelectedResource.fulfilled(
                { resourceId: "resource-1", revisionId: "revision-2" },
                "request-id",
                { resourceId: "resource-1", revisionId: "revision-2" },
            ),
        );

        expect(nextState.currentRevisionId).toBe("revision-2");
        expect(
            nextState.revisions.filter((revision) => revision.isCanonical),
        ).toHaveLength(1);
        expect(
            nextState.revisions.find((revision) => revision.isCanonical)?.id,
        ).toBe("revision-2");
    });

    it("ignores canonical updates that resolve for a stale resource", () => {
        const state = createState([
            createRevisionEntry({
                id: "revision-1",
                versionNumber: 1,
                isCanonical: true,
            }),
            createRevisionEntry({ id: "revision-2", versionNumber: 2 }),
        ]);

        const nextState = revisionsReducer(
            { ...state, resourceId: "resource-2" },
            setCanonicalRevisionForSelectedResource.fulfilled(
                { resourceId: "resource-1", revisionId: "revision-2" },
                "request-id",
                { resourceId: "resource-1", revisionId: "revision-2" },
            ),
        );

        expect(nextState).toEqual({ ...state, resourceId: "resource-2" });
    });
});
