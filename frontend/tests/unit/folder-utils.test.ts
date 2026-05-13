import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readFolderTree, renameFolderById } from "../../src/lib/models/folder-utils";
import { removeDirRetry } from "./helpers/fs-utils";

describe("readFolderTree", () => {
    it("returns empty array for a non-existent directory", async () => {
        const result = await readFolderTree("/tmp/__does_not_exist_getwrite__");
        expect(result).toEqual([]);
    });

    it("skips directories that have no folder.json without throwing", async () => {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gw-fu-orphan-"));
        try {
            // orphan directory: exists but no folder.json
            await fs.mkdir(path.join(tmp, "orphan"));
            const result = await readFolderTree(tmp);
            expect(result).toEqual([]);
        } finally {
            await removeDirRetry(tmp);
        }
    });

    it("returns folder descriptors for directories that have folder.json", async () => {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gw-fu-valid-"));
        try {
            const descriptor = { id: "abc-123", name: "Workspace", slug: "workspace" };
            await fs.mkdir(path.join(tmp, "workspace"));
            await fs.writeFile(
                path.join(tmp, "workspace", "folder.json"),
                JSON.stringify(descriptor),
                "utf-8",
            );
            const result = await readFolderTree(tmp);
            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({ id: "abc-123", name: "Workspace" });
        } finally {
            await removeDirRetry(tmp);
        }
    });

    it("recurses into subdirectories and collects nested descriptors", async () => {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gw-fu-nested-"));
        try {
            const workspace = { id: "ws-1", name: "Workspace", slug: "workspace" };
            const chapters = { id: "ch-1", name: "Chapters", slug: "chapters", parentId: "ws-1" };
            const chapter1 = { id: "c1-1", name: "Chapter 1", slug: "chapter-1", parentId: "ch-1" };

            await fs.mkdir(path.join(tmp, "workspace", "chapters", "chapter-1"), { recursive: true });
            await fs.writeFile(path.join(tmp, "workspace", "folder.json"), JSON.stringify(workspace), "utf-8");
            await fs.writeFile(path.join(tmp, "workspace", "chapters", "folder.json"), JSON.stringify(chapters), "utf-8");
            await fs.writeFile(path.join(tmp, "workspace", "chapters", "chapter-1", "folder.json"), JSON.stringify(chapter1), "utf-8");

            const result = await readFolderTree(tmp);
            expect(result).toHaveLength(3);
            const ids = (result as Array<{ id: string }>).map((f) => f.id).sort();
            expect(ids).toEqual(["c1-1", "ch-1", "ws-1"]);
        } finally {
            await removeDirRetry(tmp);
        }
    });

    it("handles a mix of orphan directories and valid descriptors without crashing", async () => {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gw-fu-mix-"));
        try {
            // orphan at top level (no folder.json)
            await fs.mkdir(path.join(tmp, "orphan", "child"), { recursive: true });
            const childDescriptor = { id: "child-1", name: "Child", slug: "child" };
            await fs.writeFile(
                path.join(tmp, "orphan", "child", "folder.json"),
                JSON.stringify(childDescriptor),
                "utf-8",
            );

            // valid top-level folder
            const validDescriptor = { id: "valid-1", name: "Notes", slug: "notes" };
            await fs.mkdir(path.join(tmp, "notes"));
            await fs.writeFile(
                path.join(tmp, "notes", "folder.json"),
                JSON.stringify(validDescriptor),
                "utf-8",
            );

            const result = await readFolderTree(tmp);
            // child is reachable through recursion even though its parent has no descriptor
            expect(result).toHaveLength(2);
            const ids = (result as Array<{ id: string }>).map((f) => f.id).sort();
            expect(ids).toEqual(["child-1", "valid-1"]);
        } finally {
            await removeDirRetry(tmp);
        }
    });
});

describe("renameFolderById", () => {
    it("returns null when foldersDir does not exist", async () => {
        const result = await renameFolderById("/tmp/__nonexistent_gw__", "any-id", "New Name");
        expect(result).toBeNull();
    });

    it("returns null when no folder with matching id exists", async () => {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gw-rfbi-miss-"));
        try {
            const descriptor = { id: "other-id", name: "Other", slug: "other" };
            await fs.mkdir(path.join(tmp, "other"));
            await fs.writeFile(path.join(tmp, "other", "folder.json"), JSON.stringify(descriptor), "utf-8");
            const result = await renameFolderById(tmp, "no-such-id", "New Name");
            expect(result).toBeNull();
        } finally {
            await removeDirRetry(tmp);
        }
    });

    it("updates name in folder.json and returns updated data", async () => {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gw-rfbi-update-"));
        try {
            const descriptor = { id: "folder-1", name: "Old Name", slug: "folder-1" };
            await fs.mkdir(path.join(tmp, "folder-1"));
            await fs.writeFile(path.join(tmp, "folder-1", "folder.json"), JSON.stringify(descriptor), "utf-8");

            const result = await renameFolderById(tmp, "folder-1", "New Name");
            expect(result).toMatchObject({ id: "folder-1", name: "New Name", slug: "folder-1" });

            const written = JSON.parse(await fs.readFile(path.join(tmp, "folder-1", "folder.json"), "utf-8"));
            expect(written.name).toBe("New Name");
        } finally {
            await removeDirRetry(tmp);
        }
    });

    it("finds folder by id when directory name is slug, not id", async () => {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gw-rfbi-slug-"));
        try {
            const descriptor = { id: "uuid-abc-123", name: "Old", slug: "my-folder-slug" };
            await fs.mkdir(path.join(tmp, "my-folder-slug"));
            await fs.writeFile(path.join(tmp, "my-folder-slug", "folder.json"), JSON.stringify(descriptor), "utf-8");

            const result = await renameFolderById(tmp, "uuid-abc-123", "Renamed");
            expect(result).toMatchObject({ id: "uuid-abc-123", name: "Renamed" });
        } finally {
            await removeDirRetry(tmp);
        }
    });

    it("finds and renames a nested folder", async () => {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gw-rfbi-nested-"));
        try {
            const parent = { id: "parent-id", name: "Parent", slug: "parent" };
            const child = { id: "child-id", name: "Child", slug: "child", parentId: "parent-id" };
            await fs.mkdir(path.join(tmp, "parent", "child"), { recursive: true });
            await fs.writeFile(path.join(tmp, "parent", "folder.json"), JSON.stringify(parent), "utf-8");
            await fs.writeFile(path.join(tmp, "parent", "child", "folder.json"), JSON.stringify(child), "utf-8");

            const result = await renameFolderById(tmp, "child-id", "Renamed Child");
            expect(result).toMatchObject({ id: "child-id", name: "Renamed Child" });

            const written = JSON.parse(await fs.readFile(path.join(tmp, "parent", "child", "folder.json"), "utf-8"));
            expect(written.name).toBe("Renamed Child");
        } finally {
            await removeDirRetry(tmp);
        }
    });
});
