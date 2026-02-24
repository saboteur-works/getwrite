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
    // Create the file for the resource
    const fileName = `${slugify(resource.name)}-${resource.id}.txt`;
    console.log(`Saving resource to ${fileName}`);
    const filePath = path.join(projectPath, "resources", fileName);
    fs.writeFileSync(
        filePath,
        (resource as TextResource).plainText ?? "",
        "utf-8",
    );

    // Create the metadata for the resource
    const meta: Record<string, MetadataValue> = {
        id: resource.id,
        name: resource.name,
        type: resource.type,
        createdAt: resource.createdAt,
        orderIndex: resource.metadata?.orderIndex || 0,
        folderId: resource.folderId || null,
        slug: resource.slug || null,
    };

    writeSidecar(projectPath, resource.id, meta);
    return resource;
}
/** Options for creating a resource of a specific type. */
export interface CreateResourceOpts {
    name: string;
    type: ResourceType;
    folderId?: UUID | null;
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

export default {
    createTextResource,
    createImageResource,
    createAudioResource,
    validateResource,
};
