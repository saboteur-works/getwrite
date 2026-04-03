import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    createFolderResource,
    createTextResource,
    getLocalResources,
    writeResourceToFile,
} from "../../lib/models/resource";
import { readSidecar } from "../../lib/models/sidecar";
import { removeDirRetry } from "./helpers/fs-utils";
import { meta } from "zod/v4/core";

const folderId = "11111111-1111-4111-8111-111111111111";

describe("models/resource persistence regressions (T007)", () => {
    it("returns an empty collection when no meta directory exists", () => {
        const missingProjectRoot = path.join(
            os.tmpdir(),
            "getwrite-missing-meta-root",
        );

        expect(getLocalResources(missingProjectRoot)).toEqual([]);
    });

    it("writes text resource content and sidecar userMetadata without changing identity", async () => {
        const projectRoot = await fs.mkdtemp(
            path.join(os.tmpdir(), "getwrite-resource-persist-"),
        );

        try {
            const resource = createTextResource({
                name: "Persisted Scene",
                folderId,
                plainText: "Draft body",
                tiptap: {
                    type: "doc",
                    content: [{ type: "paragraph" }],
                },
                userMetadata: {
                    section: "intro",
                },
            });

            const written = await writeResourceToFile(projectRoot, resource);
            expect(written).toBe(resource);

            const plainTextPath = path.join(
                projectRoot,
                "resources",
                resource.id,
                "content.txt",
            );
            const tiptapPath = path.join(
                projectRoot,
                "resources",
                resource.id,
                "content.tiptap.json",
            );

            await expect(fs.readFile(plainTextPath, "utf8")).resolves.toBe(
                "Draft body",
            );
            await expect(fs.readFile(tiptapPath, "utf8")).resolves.toContain(
                '"type": "doc"',
            );

            const sidecar = await readSidecar(projectRoot, resource.id);
            expect(sidecar).toMatchObject({
                id: resource.id,
                name: "Persisted Scene",
                type: "text",
                folderId,
                slug: "persisted-scene",
            });

            const localResources = getLocalResources(projectRoot);
            expect(localResources).toHaveLength(1);
            expect(localResources[0]).toMatchObject({
                id: resource.id,
                name: resource.name,
                type: resource.type,
                folderId,
            });
        } finally {
            await removeDirRetry(projectRoot);
        }
    });

    it("persists folder resources under the folders directory using the slug path", async () => {
        const projectRoot = await fs.mkdtemp(
            path.join(os.tmpdir(), "getwrite-folder-persist-"),
        );

        try {
            const folder = createFolderResource({
                name: "Reference Folder",
                special: true,
                metadataSource: {
                    isMetadataSource: true,
                    metadataInputType: "select",
                },
            });

            await writeResourceToFile(projectRoot, folder);
            await new Promise((resolve) => setTimeout(resolve, 25));

            const folderRecordPath = path.join(
                projectRoot,
                "folders",
                folder.slug ?? folder.id,
                "folder.json",
            );
            const folderRecord = JSON.parse(
                await fs.readFile(folderRecordPath, "utf8"),
            ) as { id: string; name: string; type: string; special?: boolean };

            expect(folderRecord).toMatchObject({
                id: folder.id,
                name: "Reference Folder",
                type: "folder",
                special: true,
                metadataSource: {
                    isMetadataSource: true,
                    metadataInputType: "select",
                },
            });
        } finally {
            await removeDirRetry(projectRoot);
        }
    });
});
