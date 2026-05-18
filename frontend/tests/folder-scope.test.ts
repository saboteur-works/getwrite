import { describe, it, expect } from "vitest";
import {
    resolveFolderScope,
    filterResourceOptionsByScope,
} from "../components/Sidebar/folderScope";
import type { Folder } from "../src/lib/models/types";

function makeFolder(id: string, parentId?: string | null): Folder {
    return {
        id,
        type: "folder",
        name: id,
        slug: id,
        orderIndex: 0,
        createdAt: "2024-01-01T00:00:00.000Z",
        parentId: parentId ?? null,
    };
}

const FOLDERS: Folder[] = [
    makeFolder("root"),
    makeFolder("child-a", "root"),
    makeFolder("child-b", "root"),
    makeFolder("grandchild", "child-a"),
    makeFolder("other"),
];

const RESOURCES = [
    { id: "r1", name: "R1", folderId: "root" },
    { id: "r2", name: "R2", folderId: "child-a" },
    { id: "r3", name: "R3", folderId: "child-b" },
    { id: "r4", name: "R4", folderId: "grandchild" },
    { id: "r5", name: "R5", folderId: "other" },
    { id: "r6", name: "R6", folderId: null },
];

describe("resolveFolderScope", () => {
    it("returns only the refFolder when includeSubfolders is false", () => {
        const scope = resolveFolderScope(FOLDERS, "root", false);
        expect(scope).toEqual(new Set(["root"]));
    });

    it("returns refFolder and all descendants when includeSubfolders is true", () => {
        const scope = resolveFolderScope(FOLDERS, "root", true);
        expect(scope).toEqual(new Set(["root", "child-a", "child-b", "grandchild"]));
    });

    it("includes multi-level descendants (grandchildren)", () => {
        const scope = resolveFolderScope(FOLDERS, "child-a", true);
        expect(scope).toEqual(new Set(["child-a", "grandchild"]));
    });

    it("returns singleton set for a leaf folder with includeSubfolders true", () => {
        const scope = resolveFolderScope(FOLDERS, "grandchild", true);
        expect(scope).toEqual(new Set(["grandchild"]));
    });

    it("does not include sibling or unrelated folders", () => {
        const scope = resolveFolderScope(FOLDERS, "child-a", true);
        expect(scope.has("child-b")).toBe(false);
        expect(scope.has("other")).toBe(false);
        expect(scope.has("root")).toBe(false);
    });
});

describe("filterResourceOptionsByScope", () => {
    it("returns all named resources when refFolder is undefined", () => {
        const result = filterResourceOptionsByScope(RESOURCES, FOLDERS, undefined, undefined);
        const names = result.map((o) => o.name);
        expect(names).toContain("R1");
        expect(names).toContain("R2");
        expect(names).toContain("R3");
        expect(names).toContain("R4");
        expect(names).toContain("R5");
    });

    it("excludes resources with null folderId when refFolder is undefined", () => {
        const result = filterResourceOptionsByScope(RESOURCES, FOLDERS, undefined, undefined);
        const names = result.map((o) => o.name);
        expect(names).toContain("R6");
    });

    it("returns only direct-folder resources when refFolder is set and includeSubfolders is false", () => {
        const result = filterResourceOptionsByScope(RESOURCES, FOLDERS, "root", false);
        expect(result).toEqual([{ id: "r1", name: "R1" }]);
    });

    it("returns resources in refFolder and all descendants when includeSubfolders is true", () => {
        const result = filterResourceOptionsByScope(RESOURCES, FOLDERS, "root", true);
        const names = result.map((o) => o.name).sort();
        expect(names).toEqual(["R1", "R2", "R3", "R4"]);
    });

    it("excludes resources from unrelated folders when refFolder is set", () => {
        const result = filterResourceOptionsByScope(RESOURCES, FOLDERS, "root", true);
        const names = result.map((o) => o.name);
        expect(names).not.toContain("R5");
    });

    it("returns ResourceOption shape (id + name only)", () => {
        const result = filterResourceOptionsByScope(RESOURCES, FOLDERS, "child-a", false);
        expect(result).toEqual([{ id: "r2", name: "R2" }]);
    });

    it("skips resources without a name", () => {
        const resources = [
            { id: "rx", name: "", folderId: "root" },
            { id: "r1", name: "R1", folderId: "root" },
        ];
        const result = filterResourceOptionsByScope(resources, FOLDERS, "root", false);
        expect(result).toEqual([{ id: "r1", name: "R1" }]);
    });
});
