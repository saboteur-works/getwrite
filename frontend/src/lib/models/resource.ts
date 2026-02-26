import { generateUUID } from "./uuid";
import type {
    UUID,
    TextResource,
    ImageResource,
    AudioResource,
    MetadataValue,
    TipTapDocument,
    AnyResource,
    ResourceType,
} from "./types";
import {
    TextResourceSchema,
    ImageResourceSchema,
    AudioResourceSchema,
    AnyResourceSchema,
} from "./schemas";

import fs from "node:fs";
import path from "node:path";
import { writeSidecar } from "./sidecar";
function slugify(s: string): string {
    return s
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9\-]/g, "");
}
/** Create a `TextResource` with sensible defaults and derived metrics. */
export function createTextResource(params: {
    name: string;
    folderId?: UUID | null;
    plainText?: string;
    tiptap?: TipTapDocument;
    slug?: string;
    metadata?: Record<string, MetadataValue>;
    orderIndex?: number;
}): TextResource {
    const now = new Date().toISOString();
    const id = generateUUID();
    const plain = params.plainText ?? "";

    const wordCount =
        plain.trim() === "" ? 0 : plain.trim().split(/\s+/).length;
    const charCount = plain.length;
    const paragraphCount =
        plain.split(/\n\s*\n/).filter(Boolean).length || (plain.trim() ? 1 : 0);
    const res: TextResource = {
        id,
        name: params.name,
        slug: params.slug ?? slugify(params.name),
        type: "text",
        folderId: params.folderId,
        createdAt: now,
        plainText: plain,
        tiptap: params.tiptap,
        wordCount,
        charCount,
        paragraphCount,
        metadata: params.metadata,
        orderIndex: params.orderIndex,
    };

    // Runtime validation - will throw on invalid shapes
    TextResourceSchema.parse(res);
    return res;
}

/** Create an `ImageResource` with optional metadata. */
export function createImageResource(params: {
    name: string;
    folderId?: UUID | null;
    width?: number;
    height?: number;
    exif?: Record<string, MetadataValue>;
    slug?: string;
    metadata?: Record<string, MetadataValue>;
}): ImageResource {
    const now = new Date().toISOString();
    const id = generateUUID();
    const res: ImageResource = {
        id,
        name: params.name,
        slug: params.slug ?? slugify(params.name),
        type: "image",
        folderId: params.folderId,
        createdAt: now,
        width: params.width,
        height: params.height,
        exif: params.exif,
        metadata: params.metadata,
    };

    ImageResourceSchema.parse(res);
    return res;
}

/** Create an `AudioResource` with optional metadata. */
export function createAudioResource(params: {
    name: string;
    folderId?: UUID | null;
    durationSeconds?: number;
    format?: string;
    slug?: string;
    metadata?: Record<string, MetadataValue>;
}): AudioResource {
    const now = new Date().toISOString();
    const id = generateUUID();
    const res: AudioResource = {
        id,
        name: params.name,
        slug: params.slug ?? slugify(params.name),
        type: "audio",
        folderId: params.folderId,
        createdAt: now,
        durationSeconds: params.durationSeconds,
        format: params.format,
        metadata: params.metadata,
    };

    AudioResourceSchema.parse(res);
    return res;
}

/** Validate an arbitrary input as AnyResource and return the typed value. */
export function validateResource(input: unknown) {
    return AnyResourceSchema.parse(input);
}

/**
 * Save a resource to the filesystem (MVP: text only).
 * This function should only be called from backend contexts.
 * */
export function writeResourceToFile(
    projectPath: string,
    resource: AnyResource,
): AnyResource {
    // Set up base path for resource
    const base = path.join(projectPath, "resources", resource.id);
    if (resource.type === "text") {
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

    writeSidecar(projectPath, resource.id, sidecarData);
    return resource;
}
/** Options for creating a resource of a specific type. */
export interface CreateResourceOpts {
    name: string;
    type: ResourceType;
    folderId?: UUID | null;
    orderIndex?: number;
    metadata?: Record<string, MetadataValue>;
    // Text-specific
    text?: {
        plainText?: string;
        tiptap?: TipTapDocument;
    };
    // Image-specific
    image?: {
        width?: number;
        height?: number;
        exif?: Record<string, MetadataValue>;
    };
    // Audio-specific
    audio?: {
        durationSeconds?: number;
        format?: string;
    };
}

export const createResourceOfType = (
    resourceType: ResourceType,
    opts: CreateResourceOpts,
) => {
    const baseParams = {
        name: opts.name,
        folderId: opts.folderId,
        metadata: opts.metadata,
    };

    switch (resourceType) {
        case "text":
            return createTextResource({
                ...baseParams,
                plainText: opts.text?.plainText,
                tiptap: opts.text?.tiptap,
            });
        case "image":
            return createImageResource({
                ...baseParams,
                width: opts.image?.width,
                height: opts.image?.height,
                exif: opts.image?.exif,
            });
        case "audio":
            return createAudioResource({
                ...baseParams,
                durationSeconds: opts.audio?.durationSeconds,
                format: opts.audio?.format,
            });
        default:
            throw new Error(`Unsupported resource type: ${resourceType}`);
    }
};

export const getLocalResources = (projectPath: string) => {
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

export default {
    createTextResource,
    createImageResource,
    createAudioResource,
    validateResource,
};
