/**
 * @module resource
 *
 * Resource API surface and local persistence helpers.
 *
 * This module is responsible for:
 * - Re-exporting stable factory and validation APIs from `resource-factory`.
 * - Persisting resource payloads/metadata to local filesystem storage.
 * - Loading resource metadata from local sidecar/meta files.
 */
import type { AnyResource, Folder, MetadataValue, TextResource } from "./types";

import fs from "node:fs";
import path from "node:path";
import {
    createAudioResource,
    createImageResource,
    createTextResource,
    validateResource,
} from "./resource-factory";
import { writeSidecar } from "./sidecar";

/**
 * Type guard for folder resources.
 */
function isFolderResource(resource: AnyResource): resource is Folder {
    return resource.type === "folder";
}

/**
 * Type guard for text resources.
 */
function isTextResource(resource: AnyResource): resource is TextResource {
    return resource.type === "text" && !isFolderResource(resource);
}

/**
 * Persists a resource to local filesystem storage.
 *
 * Storage behavior by type:
 * - `folder`: writes `folders/<slug-or-id>/folder.json`.
 * - `text`: writes `resources/<id>/content.tiptap.json` and `content.txt`.
 * - non-folder resources: writes sidecar metadata via `writeSidecar(...)`.
 *
 * This function is intended for backend/server contexts only.
 *
 * @param projectPath - Absolute path to the project root directory.
 * @param resource - Resource to persist.
 * @returns The same resource after persistence completes.
 * @throws {Error} If filesystem writes fail.
 *
 * @example
 * await writeResourceToFile(projectPath, textResource);
 */
export async function writeResourceToFile(
    projectPath: string,
    resource: AnyResource,
): Promise<AnyResource> {
    // Set up base path for resource
    const base = path.join(
        projectPath,
        resource.type === "folder" ? "folders" : "resources",
        resource.id,
    );

    if (isFolderResource(resource)) {
        const dir = path.join(
            projectPath,
            "folders",
            resource.slug ?? resource.id,
        );
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        await fs.writeFile(
            path.join(dir, "folder.json"),
            JSON.stringify(resource, null, 2),
            "utf8",
            () => {},
        );
        return resource;
    }

    if (isTextResource(resource)) {
        // Create directory if it doesn't exist
        if (!fs.existsSync(base)) {
            fs.mkdirSync(base, { recursive: true });
        }

        // Write both TipTap JSON and plain text forms
        const tiptapPath = `${base}/content.tiptap.json`;
        const plainPath = `${base}/content.txt`;
        fs.writeFileSync(
            tiptapPath,
            JSON.stringify(resource.tiptap ?? {}, null, 2),
            "utf8",
        );
        fs.writeFileSync(plainPath, resource.plainText ?? "", "utf8");
    }

    // Create the metadata for the resource
    const sidecarData: Record<string, MetadataValue> = {
        id: resource.id,
        name: resource.name,
        type: resource.type,
        createdAt: resource.createdAt,
        orderIndex: resource.metadata?.orderIndex || 0,
        folderId: resource.folderId || null,
        slug: resource.slug || null,
        metadata: resource.metadata || {},
    };

    await writeSidecar(projectPath, resource.id, sidecarData);
    return resource;
}
export {
    createAudioResource,
    createFolderResource,
    createImageResource,
    createResourceOfType,
    createTextResource,
    validateResource,
} from "./resource-factory";
export type { CreateResourceOpts } from "./resource-factory";

/**
 * Loads locally stored resources from `<projectPath>/meta/*.json`.
 *
 * Each metadata file is parsed and validated via {@link validateResource}.
 * Non-JSON files are ignored.
 *
 * @param projectPath - Absolute path to the project root directory.
 * @returns Array of validated resources, or `[]` if no meta directory exists.
 * @throws {Error} If file reads or JSON parsing fails.
 *
 * @example
 * const resources = getLocalResources(projectPath);
 */
export const getLocalResources = (projectPath: string): AnyResource[] => {
    const metaDir = path.join(projectPath, "meta");
    if (!fs.existsSync(metaDir)) {
        return [];
    }

    const metaFiles = fs.readdirSync(metaDir);
    const resources: AnyResource[] = [];
    for (const metaFile of metaFiles) {
        if (!metaFile.endsWith(".json")) {
            continue;
        }
        const metaPath = path.join(metaDir, metaFile);
        console.log(metaPath);
        const metaData = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        resources.push(validateResource(metaData));
    }
    return resources;
};

/**
 * Convenience default export of core resource factory/validation helpers.
 */
export default {
    createTextResource,
    createImageResource,
    createAudioResource,
    validateResource,
};
