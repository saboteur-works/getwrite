import { describe, expect, it } from "vitest";

import { buildProjectView } from "../../src/lib/models/project-view";
import { createTextResource } from "../../src/lib/models/resource";
import type { Folder, Project, TextResource } from "../../src/lib/models/types";

const project: Project = {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Adapter Test Project",
    createdAt: "2026-03-21T12:00:00.000Z",
};

const alphaFolder: Folder = {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Alpha",
    slug: "alpha",
    type: "folder",
    createdAt: "2026-03-21T12:01:00.000Z",
    orderIndex: 1,
};

const betaFolder: Folder = {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Beta",
    slug: "beta",
    type: "folder",
    createdAt: "2026-03-21T12:02:00.000Z",
    orderIndex: 2,
};

describe("models/project-view adapter regressions (T007)", () => {
    it("sorts folders and child resources into the flat legacy view shape", () => {
        const betaScene: TextResource = {
            ...createTextResource({
                name: "Beta Scene",
                folderId: betaFolder.id,
                plainText: "beta content",
                orderIndex: 3,
                userMetadata: { status: "draft" },
            }),
            updatedAt: "2026-03-21T12:10:00.000Z",
        };

        const alphaSecond: TextResource = {
            ...createTextResource({
                name: "Alpha Second",
                folderId: alphaFolder.id,
                plainText: "second content",
                orderIndex: 2,
            }),
            updatedAt: "2026-03-21T12:11:00.000Z",
        };

        const alphaFirst: TextResource = {
            ...createTextResource({
                name: "Alpha First",
                folderId: alphaFolder.id,
                plainText: "first content",
                orderIndex: 1,
            }),
            updatedAt: "2026-03-21T12:12:00.000Z",
        };

        const view = buildProjectView({
            project,
            folders: [betaFolder, alphaFolder],
            resources: [betaScene, alphaSecond, alphaFirst],
        });

        expect(view.folders.map((folder) => folder.name)).toEqual([
            "Alpha",
            "Beta",
        ]);
        expect(
            view.folders[0].resources.map((resource) => resource.title),
        ).toEqual(["Alpha First", "Alpha Second"]);
        expect(view.resources.map((resource) => resource.title)).toEqual([
            "Alpha",
            "Alpha First",
            "Alpha Second",
            "Beta",
            "Beta Scene",
        ]);
        expect(view.resources[1]).toMatchObject({
            id: alphaFirst.id,
            projectId: project.id,
            title: "Alpha First",
            content: "first content",
            updatedAt: "2026-03-21T12:12:00.000Z",
            _orderIndex: 1,
        });
    });

    it("falls back to 0 when resources have no explicit orderIndex", () => {
        const firstInput = createTextResource({
            name: "First Input",
            folderId: alphaFolder.id,
            plainText: "A",
        });
        const secondInput = createTextResource({
            name: "Second Input",
            folderId: alphaFolder.id,
            plainText: "B",
        });

        const view = buildProjectView({
            project,
            folders: [alphaFolder],
            resources: [firstInput, secondInput],
        });

        expect(
            view.folders[0].resources.map((resource) => resource.title),
        ).toEqual(["First Input", "Second Input"]);
        expect(
            view.folders[0].resources.map((resource) => resource._orderIndex),
        ).toEqual([0, 0]);
    });

    it("sorts by top-level orderIndex regardless of input array order", () => {
        // Resources passed in reverse orderIndex order — adapter must sort them
        const r2 = createTextResource({
            name: "Second",
            folderId: alphaFolder.id,
            orderIndex: 1,
        });
        const r3 = createTextResource({
            name: "Third",
            folderId: alphaFolder.id,
            orderIndex: 2,
        });
        const r1 = createTextResource({
            name: "First",
            folderId: alphaFolder.id,
            orderIndex: 0,
        });

        const view = buildProjectView({
            project,
            folders: [alphaFolder],
            resources: [r2, r3, r1],
        });

        expect(
            view.folders[0].resources.map((r) => r.title),
        ).toEqual(["First", "Second", "Third"]);
        expect(
            view.folders[0].resources.map((r) => r._orderIndex),
        ).toEqual([0, 1, 2]);
    });

    it("orderIndex is unchanged when notes are added to userMetadata", () => {
        const r = createTextResource({
            name: "Scene",
            folderId: alphaFolder.id,
            orderIndex: 5,
        });
        const withNotes: TextResource = {
            ...r,
            userMetadata: { ...r.userMetadata, notes: "some notes here" },
        };

        const before = buildProjectView({
            project,
            folders: [alphaFolder],
            resources: [r],
        });
        const after = buildProjectView({
            project,
            folders: [alphaFolder],
            resources: [withNotes],
        });

        expect(before.folders[0].resources[0]._orderIndex).toBe(5);
        expect(after.folders[0].resources[0]._orderIndex).toBe(5);
    });

    it("orderIndex is unchanged when status, pov, storyDate, storyDuration are set", () => {
        const r = createTextResource({
            name: "Scene",
            folderId: alphaFolder.id,
            orderIndex: 3,
        });
        const withMeta: TextResource = {
            ...r,
            userMetadata: {
                ...r.userMetadata,
                status: "in-progress",
                pov: "Alice",
                storyDate: "2024-06-15",
                storyDuration: 45,
            },
        };

        const view = buildProjectView({
            project,
            folders: [alphaFolder],
            resources: [withMeta],
        });

        expect(view.folders[0].resources[0]._orderIndex).toBe(3);
    });

    it("orderIndex is unchanged when dynamic metadata provider keys are set", () => {
        const r1 = createTextResource({
            name: "Chapter One",
            folderId: alphaFolder.id,
            orderIndex: 0,
        });
        const r2 = createTextResource({
            name: "Chapter Two",
            folderId: alphaFolder.id,
            orderIndex: 1,
        });

        // Simulate Metadata Provider links being set (characters, locations, items)
        const r1WithMeta: TextResource = {
            ...r1,
            userMetadata: {
                ...r1.userMetadata,
                characters: ["Alice", "Bob"],
                locations: ["Forest"],
                items: ["Sword"],
            },
        };
        const r2WithMeta: TextResource = {
            ...r2,
            userMetadata: {
                ...r2.userMetadata,
                characters: ["Carol"],
                locations: ["Castle", "Forest"],
            },
        };

        const view = buildProjectView({
            project,
            folders: [alphaFolder],
            resources: [r2WithMeta, r1WithMeta],
        });

        expect(view.folders[0].resources.map((r) => r.title)).toEqual([
            "Chapter One",
            "Chapter Two",
        ]);
        expect(view.folders[0].resources.map((r) => r._orderIndex)).toEqual([
            0, 1,
        ]);
    });

    it("orderIndex is stable across all metadata field combinations simultaneously", () => {
        const resources = [
            createTextResource({
                name: "C",
                folderId: alphaFolder.id,
                orderIndex: 2,
                userMetadata: {
                    notes: "note c",
                    status: "draft",
                    pov: "Bob",
                    characters: ["Alice"],
                    storyDate: "2024-03-01",
                    storyDuration: 30,
                },
            }),
            createTextResource({
                name: "A",
                folderId: alphaFolder.id,
                orderIndex: 0,
                userMetadata: {
                    notes: "note a",
                    status: "published",
                    locations: ["Forest", "Castle"],
                    storyDate: "2024-01-01",
                },
            }),
            createTextResource({
                name: "B",
                folderId: alphaFolder.id,
                orderIndex: 1,
                userMetadata: {
                    status: "in-progress",
                    items: ["Sword"],
                    storyDuration: 90,
                },
            }),
        ];

        const view = buildProjectView({
            project,
            folders: [alphaFolder],
            resources,
        });

        expect(view.folders[0].resources.map((r) => r.title)).toEqual([
            "A",
            "B",
            "C",
        ]);
        expect(view.folders[0].resources.map((r) => r._orderIndex)).toEqual([
            0, 1, 2,
        ]);
    });
});
