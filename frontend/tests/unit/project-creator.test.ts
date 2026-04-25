import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createAndAssertProject } from "./helpers/project-creator";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { removeDirRetry } from "./helpers/fs-utils";
import { listRevisions } from "../../src/lib/models/revision";

describe("models/project-creator", () => {
    it("creates subfolders from defaultFolders declarations", async () => {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-sf-"));
        try {
            const spec = {
                id: "test-subfolder",
                name: "Subfolder Test",
                folders: [
                    { name: "Workspace", special: true },
                    { name: "Drafts" },
                ],
                defaultFolders: [
                    { folder: "Drafts", name: "Act 1" },
                    { folder: "Drafts", name: "Act 2" },
                ],
            };
            const { folders } = await createAndAssertProject(
                spec as Parameters<typeof createAndAssertProject>[0],
                { projectRoot: tmp, name: "Subfolder Test Project" },
            );

            // 2 top-level + 2 subfolders
            expect(folders.length).toBe(4);
            const subs = folders.filter((f) => f.parentId != null);
            expect(subs.length).toBe(2);
            expect(subs.map((f) => f.name).sort()).toEqual(["Act 1", "Act 2"]);

            // directories exist on disk
            const act1Dir = path.join(tmp, "folders", "drafts", "act-1");
            await expect(fs.access(act1Dir)).resolves.toBeUndefined();

            await flushIndexer();
        } finally {
            await removeDirRetry(tmp);
        }
    });

    it("creates project structure and resource placeholders from spec", async () => {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-pc-"));
        try {
            const specPath = path.join(
                process.cwd(),
                "..",
                "specs",
                "002-define-data-models",
                "project-types",
                "novel_project_type.json",
            );

            const { projectPath, folders, resources } =
                await createAndAssertProject(specPath, {
                    projectRoot: tmp,
                    name: "My Novel",
                });

            // project.json exists
            const pj = await fs.readFile(
                path.join(projectPath, "project.json"),
                "utf8",
            );
            expect(pj).toBeTruthy();

            // folders directory exists and has workspace
            const foldersDir = path.join(projectPath, "folders");
            const entries = await fs.readdir(foldersDir);
            expect(entries.length).toBeGreaterThanOrEqual(1);

            // resources dir exists and resources have sidecars
            const meta = await fs.readdir(path.join(projectPath, "meta"));
            expect(meta.length).toBeGreaterThanOrEqual(resources.length);

            for (const resource of resources) {
                const revisions = await listRevisions(projectPath, resource.id);
                expect(revisions.length).toBe(1);
                expect(revisions[0]?.versionNumber).toBe(1);
                expect(revisions[0]?.isCanonical).toBe(true);
            }

            // ensure background indexing finished before cleanup
            await flushIndexer();
        } finally {
            await removeDirRetry(tmp);
        }
    });
});
