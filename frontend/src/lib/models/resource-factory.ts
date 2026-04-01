/**
 * @module resource-factory
 *
 * Pure resource construction and validation helpers.
 *
 * This module is responsible for:
 * - Constructing strongly typed resource objects (`text`, `image`, `audio`, `folder`).
 * - Performing runtime schema validation before returning created resources.
 * - Dispatching resource creation by `ResourceType`.
 */
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
    Folder,
} from "./types";
import {
    TextResourceSchema,
    ImageResourceSchema,
    AudioResourceSchema,
    AnyResourceSchema,
    FolderSchema,
} from "./schemas";

/**
 * Converts display names to URL/file-system friendly slugs.
 */
function slugify(s: string): string {
    return s
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9\-]/g, "");
}

/**
 * Creates a validated `TextResource` with derived text metrics.
 */
export function createTextResource(params: {
    name: string;
    folderId?: UUID | null;
    plainText?: string;
    tiptap?: TipTapDocument;
    slug?: string;
    userMetadata?: Record<string, MetadataValue>;
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
        userMetadata: params.userMetadata,
        orderIndex: params.orderIndex,
    };

    TextResourceSchema.parse(res);
    return res;
}

/**
 * Creates a validated `ImageResource`.
 */
export function createImageResource(params: {
    name: string;
    folderId?: UUID | null;
    width?: number;
    height?: number;
    exif?: Record<string, MetadataValue>;
    slug?: string;
    userMetadata?: Record<string, MetadataValue>;
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
        userMetadata: params.userMetadata,
    };

    ImageResourceSchema.parse(res);
    return res;
}

/**
 * Creates a validated `AudioResource`.
 */
export function createAudioResource(params: {
    name: string;
    folderId?: UUID | null;
    durationSeconds?: number;
    format?: string;
    slug?: string;
    userMetadata?: Record<string, MetadataValue>;
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
        userMetadata: params.userMetadata,
    };

    AudioResourceSchema.parse(res);
    return res;
}

/**
 * Validates unknown input as `AnyResource` and returns typed data.
 */
export function validateResource(input: unknown): AnyResource {
    return AnyResourceSchema.parse(input) as AnyResource;
}

/**
 * Creates a validated `Folder` resource.
 */
export function createFolderResource(params: {
    name: string;
    parentFolderId?: UUID | null;
    slug?: string;
    userMetadata?: Record<string, MetadataValue>;
    orderIndex?: number;
    special?: boolean;
}): Folder {
    const now = new Date().toISOString();
    const id = generateUUID();
    const res: Folder = {
        id,
        name: params.name,
        slug: params.slug ?? slugify(params.name),
        type: "folder",
        folderId: params.parentFolderId,
        createdAt: now,
        userMetadata: params.userMetadata,
        orderIndex: params.orderIndex,
        special: params.special ?? false,
    };

    FolderSchema.parse(res);
    return res;
}

/**
 * Input options for `createResourceOfType(...)`.
 */
export interface CreateResourceOpts {
    name: string;
    type: ResourceType;
    folderId?: UUID | null;
    orderIndex?: number;
    userMetadata?: Record<string, MetadataValue>;
    text?: {
        plainText?: string;
        tiptap?: TipTapDocument;
    };
    image?: {
        width?: number;
        height?: number;
        exif?: Record<string, MetadataValue>;
    };
    audio?: {
        durationSeconds?: number;
        format?: string;
    };
}

/**
 * Dispatches to the correct resource factory based on `resourceType`.
 */
export const createResourceOfType = (
    resourceType: ResourceType,
    opts: CreateResourceOpts,
) => {
    const baseParams = {
        name: opts.name,
        folderId: opts.folderId,
        userMetadata: opts.userMetadata,
        orderIndex: opts.orderIndex,
    };

    switch (resourceType) {
        case "folder":
            return createFolderResource({
                ...baseParams,
                parentFolderId: opts.folderId,
            });
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
