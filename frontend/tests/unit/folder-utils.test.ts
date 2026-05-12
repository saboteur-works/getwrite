import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readFolderTree } from "../../src/lib/models/folder-utils";
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
