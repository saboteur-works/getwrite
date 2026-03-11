/**
 * @module resource
 *
 * Resource factory, validation, and local persistence helpers.
 *
 * This module is responsible for:
 * - Constructing strongly typed resource objects (`text`, `image`, `audio`, `folder`).
 * - Performing runtime schema validation before returning created resources.
 * - Persisting resource payloads/metadata to local filesystem storage.
 * - Loading resource metadata from local sidecar/meta files.
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

import fs from "node:fs";
import path from "node:path";
import { writeSidecar } from "./sidecar";

/**
 * Converts display names to URL/file-system friendly slugs.
 *
 * Rules:
 * - Trim leading/trailing whitespace.
 * - Lowercase all characters.
 * - Replace whitespace runs with `-`.
 * - Remove characters outside `[a-z0-9-]`.
 *
 * @param s - Input text to normalize.
 * @returns Slugified string.
 *
 * @example
 * slugify("Chapter One!");
 * // => "chapter-one"
 */
function slugify(s: string): string {
    return s
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9\-]/g, "");
}

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
 * Creates a validated `TextResource` with derived text metrics.
 *
 * Derived metrics:
 * - `wordCount` from whitespace-split tokens.
 * - `charCount` from string length.
 * - `paragraphCount` from blank-line-separated blocks.
 *
 * @param params - Resource creation inputs.
 * @param params.name - Display name of the resource.
 * @param params.folderId - Owning folder UUID, or `null` for root placement.
 * @param params.plainText - Plain-text representation of content.
 * @param params.tiptap - Optional TipTap AST document.
 * @param params.slug - Optional explicit slug; defaults to `slugify(name)`.
 * @param params.metadata - Optional arbitrary metadata persisted with resource.
 * @param params.orderIndex - Optional sibling ordering index.
 * @returns A schema-validated `TextResource`.
 * @throws {import("zod").ZodError} If the constructed resource fails schema validation.
 *
 * @example
 * const r = createTextResource({ name: "Scene 1", plainText: "Hello world" });
 */
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

/**
 * Creates a validated `ImageResource`.
 *
 * @param params - Resource creation inputs.
 * @param params.name - Display name of the resource.
 * @param params.folderId - Owning folder UUID, or `null` for root placement.
 * @param params.width - Optional pixel width.
 * @param params.height - Optional pixel height.
 * @param params.exif - Optional EXIF metadata map.
 * @param params.slug - Optional explicit slug; defaults to `slugify(name)`.
 * @param params.metadata - Optional arbitrary resource metadata.
 * @returns A schema-validated `ImageResource`.
 * @throws {import("zod").ZodError} If the constructed resource fails schema validation.
 *
 * @example
 * const r = createImageResource({ name: "Cover", width: 1200, height: 1600 });
 */
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

/**
 * Creates a validated `AudioResource`.
 *
 * @param params - Resource creation inputs.
 * @param params.name - Display name of the resource.
 * @param params.folderId - Owning folder UUID, or `null` for root placement.
 * @param params.durationSeconds - Optional audio duration in seconds.
 * @param params.format - Optional format label (for example, `"wav"`).
 * @param params.slug - Optional explicit slug; defaults to `slugify(name)`.
 * @param params.metadata - Optional arbitrary resource metadata.
 * @returns A schema-validated `AudioResource`.
 * @throws {import("zod").ZodError} If the constructed resource fails schema validation.
 *
 * @example
 * const r = createAudioResource({ name: "Take 01", durationSeconds: 13.2, format: "wav" });
 */
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

/**
 * Validates unknown input as `AnyResource` and returns typed data.
 *
 * @param input - Unknown value to validate.
 * @returns Parsed and typed `AnyResource`.
 * @throws {import("zod").ZodError} If validation fails.
 *
 * @example
 * const resource = validateResource(candidate);
 */
export function validateResource(input: unknown) {
    return AnyResourceSchema.parse(input) as AnyResource;
}

/**
 * Creates a validated `Folder` resource.
 *
 * @param params - Folder creation inputs.
 * @param params.name - Folder display name.
 * @param params.parentFolderId - Parent folder UUID, or `null` for root.
 * @param params.slug - Optional explicit slug; defaults to `slugify(name)`.
 * @param params.metadata - Optional arbitrary folder metadata.
 * @param params.orderIndex - Optional sibling ordering index.
 * @param params.special - Optional flag for system/special folders.
 * @returns A schema-validated `Folder` object.
 * @throws {import("zod").ZodError} If the constructed folder fails schema validation.
 *
 * @example
 * const folder = createFolderResource({ name: "Drafts", special: true });
 */
export function createFolderResource(params: {
    name: string;
    parentFolderId?: UUID | null;
    slug?: string;
    metadata?: Record<string, MetadataValue>;
    orderIndex?: number;
    special?: boolean;
}) {
    const now = new Date().toISOString();
    const id = generateUUID();
    const res: Folder = {
        id,
        name: params.name,
        slug: params.slug ?? slugify(params.name),
        type: "folder",
        folderId: params.parentFolderId,
        createdAt: now,
        metadata: params.metadata,
        orderIndex: params.orderIndex,
        special: params.special ?? false,
    };

    FolderSchema.parse(res);
    return res;
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
/**
 * Input options for `createResourceOfType(...)`.
 */
export interface CreateResourceOpts {
    /** Display name for the new resource. */
    name: string;
    /** Target resource type to create. */
    type: ResourceType;
    /** Owning folder UUID (or `null` for root). */
    folderId?: UUID | null;
    /** Optional sibling ordering index. */
    orderIndex?: number;
    /** Optional arbitrary resource metadata. */
    metadata?: Record<string, MetadataValue>;
    /** Text-specific creation options. */
    text?: {
        /** Optional plain-text body. */
        plainText?: string;
        /** Optional TipTap AST body. */
        tiptap?: TipTapDocument;
    };
    /** Image-specific creation options. */
    image?: {
        /** Optional pixel width. */
        width?: number;
        /** Optional pixel height. */
        height?: number;
        /** Optional EXIF metadata map. */
        exif?: Record<string, MetadataValue>;
    };
    /** Audio-specific creation options. */
    audio?: {
        /** Optional duration in seconds. */
        durationSeconds?: number;
        /** Optional format string (for example, `"mp3"`). */
        format?: string;
    };
}

/**
 * Dispatches to the correct resource factory based on `resourceType`.
 *
 * @param resourceType - Resource kind to create.
 * @param opts - Shared and type-specific creation options.
 * @returns A newly created resource matching `resourceType`.
 * @throws {Error} If `resourceType` is unsupported.
 *
 * @example
 * const img = createResourceOfType("image", {
 *   name: "Cover",
 *   type: "image",
 *   image: { width: 1200, height: 1600 },
 * });
 */
export const createResourceOfType = (
    resourceType: ResourceType,
    opts: CreateResourceOpts,
) => {
    const baseParams = {
        name: opts.name,
        folderId: opts.folderId,
        metadata: opts.metadata,
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
