/**
 * @module resource-persistence
 *
 * Resource local persistence and metadata loading helpers.
 *
 * This module is responsible for:
 * - Persisting resource payloads/metadata to local filesystem storage.
 * - Loading resource metadata from local sidecar/meta files.
 */
import fs from "node:fs";
import path from "node:path";

import { validateResource } from "./resource-factory";
import { writeSidecar } from "./sidecar";
import type { AnyResource, Folder, MetadataValue, TextResource } from "./types";

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
 */
export async function writeResourceToFile(
    projectPath: string,
    resource: AnyResource,
): Promise<AnyResource> {
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
        if (!fs.existsSync(base)) {
            fs.mkdirSync(base, { recursive: true });
        }

        const tiptapPath = `${base}/content.tiptap.json`;
        const plainPath = `${base}/content.txt`;
        fs.writeFileSync(
            tiptapPath,
            JSON.stringify(resource.tiptap ?? {}, null, 2),
            "utf8",
        );
        fs.writeFileSync(plainPath, resource.plainText ?? "", "utf8");
    }

    const sidecarData: Record<string, MetadataValue> = {
        id: resource.id,
        name: resource.name,
        type: resource.type,
        createdAt: resource.createdAt,
        orderIndex: resource.userMetadata?.orderIndex || 0,
        folderId: resource.folderId || null,
        slug: resource.slug || null,
        userMetadata: resource.userMetadata || {},
    };

    await writeSidecar(projectPath, resource.id, sidecarData);
    return resource;
}

/**
 * Loads locally stored resources from `<projectPath>/meta/*.json`.
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
