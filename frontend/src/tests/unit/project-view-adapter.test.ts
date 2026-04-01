import { describe, expect, it } from "vitest";

import { buildProjectView } from "../../lib/models/project-view";
import { createTextResource } from "../../lib/models/resource";
import type { Folder, Project, TextResource } from "../../lib/models/types";

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
                userMetadata: { orderIndex: 3, status: "draft" },
            }),
            updatedAt: "2026-03-21T12:10:00.000Z",
        };

        const alphaSecond: TextResource = {
            ...createTextResource({
                name: "Alpha Second",
                folderId: alphaFolder.id,
                plainText: "second content",
                userMetadata: { orderIndex: 2 },
            }),
            updatedAt: "2026-03-21T12:11:00.000Z",
        };

        const alphaFirst: TextResource = {
            ...createTextResource({
                name: "Alpha First",
                folderId: alphaFolder.id,
                plainText: "first content",
                userMetadata: { orderIndex: 1 },
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

    it("falls back to source iteration order when metadata order indices are absent", () => {
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
        ).toEqual([0, 1]);
    });
});
