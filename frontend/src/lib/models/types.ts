// Type definitions for GetWrite models
// Follow docs/standards/typescript-implementation.md: no `any`, explicit types, and clear documentation.

/** UUID v4 represented as a string. Use for stable opaque identities. */
export type UUID = string;

/**
 * MetadataValue: recursive union representing allowed sidecar metadata values.
 * Designed to be JSON-friendly while allowing nested structured metadata.
 */
export type MetadataValue =
    | string
    | number
    | boolean
    | null
    | string[]
    | number[]
    | boolean[]
    | { [key: string]: MetadataValue };

export type EditorHeadings = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
export type EditorHeading = {
    fontSize?: string;
    fontFamily?: string;
    fontWeight?: string;
    letterSpacing?: string;
    color?: string;
};
export type EditorBodyConfig = {
    fontFamily?: string;
    fontSize?: string;
    lineHeight?: string;
    paragraphSpacing?: string;
};

/**
 * Project-level configuration persisted with the project (project.json).
 * Contains user-editable preferences that affect model behavior.
 */
export interface ProjectConfig {
    /** Maximum revisions to retain per resource. Defaults to 50 when omitted. */
    maxRevisions?: number;
    /** Target word count for the project (e.g. 80000 for a novel). */
    wordCountGoal?: number;
    /** Custom status values available to the project (e.g., ["Draft","Complete"]). */
    statuses?: string[];
    /**
     * When true, automatically prune oldest non-canonical revisions when limit is exceeded.
     * When false, the UI should prompt the user (interactive) or abort in headless contexts.
     */
    autoPrune?: boolean;
    /** Optional list of project-scoped tags. */
    tags?: Tag[];
    /** Optional map of resourceId -> tagId[] assignments persisted in project config. */
    tagAssignments?: Record<string, string[]>;
    /** Editor configuration for the project. */
    editorConfig: {
        headings?: {
            [index in EditorHeadings]?: EditorHeading;
        };
        body?: EditorBodyConfig;
    };
}

/** Simple Tag type for project-scoped tagging. */
export interface Tag {
    id: UUID;
    name: string;
    color?: string;
}

/** Represents a single GetWrite project (local-first). */
export interface Project {
    /** Immutable UUID v4 identity for the project. */
    id: UUID;
    /** Optional human-readable slug, unique within the project. */
    slug?: string;
    /** Display name provided by the user. */
    name: string;
    /** Creation timestamp in ISO 8601 format. */
    createdAt: string;
    /** Last-modified timestamp (ISO 8601). */
    updatedAt?: string;
    /** Optional project type identifier (e.g., 'novel'). */
    projectType?: string;
    /** Filesystem root path for the project (local-first storage). */
    rootPath?: string;
    /** Project-specific configuration (see ProjectConfig). */
    config?: ProjectConfig;
    /** Arbitrary project-scoped metadata stored in sidecar or project config. */
    metadata?: Record<string, MetadataValue>;
}

export type ResourceType = "text" | "image" | "audio" | "folder";

/**
 * UI view names used by the WorkArea view switcher and related components.
 * Added to canonical models to provide a single source-of-truth for small UI unions.
 */
export type ViewName = "edit" | "organizer" | "data" | "diff" | "timeline";

/** Input types for metadata collection. */
export type MetadataInputType = "text" | "multiselect" | "autocomplete";

/** Metadata source configuration for a folder or resource. */
export type MetadataSource = {
    /** `true` if this folder or resource is a metadata source. */
    isMetadataSource: boolean;
    /** Type of input used for metadata collection. Should only be set if `isMetadataSource` is true. */
    metadataInputType?: MetadataInputType;
};

/**
 * Reserved `userMetadata` keys used by the story timeline feature.
 * These are stored as plain values in the `userMetadata` record — no schema change required.
 *
 * - `storyDate`     string  ISO date "YYYY-MM-DD" — places the resource on the story timeline
 * - `storyTime`     string  Optional "HH:mm" time-of-day; combined with storyDate as "YYYY-MM-DDTHH:mm"
 * - `storyDuration` number  Optional duration in minutes; used to compute an endDate for the timeline item
 */

/** Base attributes common to all resource types (text/image/audio). */
export interface ResourceBase {
    /** Resource UUID (immutable identity independent of path). */
    id: UUID;
    /** Human-friendly slug, unique per-project. */
    slug: string;
    /** Display name (without extension). */
    name: string;
    /** Resource media type. */
    type: ResourceType;
    /** Owning folder UUID or null for root. */
    folderId?: UUID | null;
    /** Derived filesystem size in bytes (optional). */
    sizeBytes?: number;
    /** User-editable notes. */
    notes?: string;
    /** Ordering index used for tree ordering within a parent. */
    orderIndex?: number;
    /** Status tags (project-scoped values). */
    statuses?: string[];
    /** User-set key/value metadata stored in sidecar (distinct from system fields like sizeBytes, createdAt, orderIndex). */
    userMetadata?: Record<string, MetadataValue>;
    /** Creation timestamp (ISO 8601). */
    createdAt: string;
    /** Last-modified timestamp (ISO 8601). */
    updatedAt?: string;
}

/** Logical container within a project used to group resources. */
export interface Folder extends ResourceBase {
    /** Discriminant for folder resources. */
    type: "folder";
    /** Parent folder UUID; null or undefined for top-level. */
    parentId?: UUID | null;
    special?: boolean;
    metadataSource?: MetadataSource;
}

// Minimal TipTap AST-safe types used for editor persistence.
/** Minimal TipTap AST node used for storing editor state. */
export interface TipTapNode {
    /** Node type name (e.g., 'paragraph', 'text', 'heading'). */
    type: string;
    /** Text payload for leaf `text` nodes. */
    text?: string;
    /** Optional attributes for the node (formatting, links, etc.). */
    attrs?: Record<string, MetadataValue>;
    /** Child nodes for nested structures. */
    content?: TipTapNode[];
}

/** Minimal TipTap document root used for persistence. */
export interface TipTapDocument {
    type: "doc";
    content: TipTapNode[];
}

/** Text resource model: stores both plain and TipTap representations. */
export interface TextResource extends ResourceBase {
    type: "text";
    /** Canonical plain-text representation used for exports and search. */
    plainText?: string;
    /** TipTap document used for editor persistence and rich editing. */
    tiptap?: TipTapDocument;
    /** Derived metrics for quick display. */
    wordCount?: number;
    charCount?: number;
    paragraphCount?: number;
}

/** Image resource model with common image metadata. */
export interface ImageResource extends ResourceBase {
    type: "image";
    /** Optional image width in pixels. */
    width?: number;
    /** Optional image height in pixels. */
    height?: number;
    /** EXIF and related metadata extracted from the image. */
    exif?: Record<string, MetadataValue>;
}

/** Audio resource model with common audio metadata. */
export interface AudioResource extends ResourceBase {
    type: "audio";
    /** Duration in seconds if available. */
    durationSeconds?: number;
    /** File format (e.g., 'mp3', 'wav'). */
    format?: string;
}

/** Revision metadata describing stored copies for a resource. */
export interface Revision {
    /** Revision UUID */
    id: UUID;
    /** Parent resource UUID */
    resourceId: UUID;
    /** Monotonic version number for the resource's revision history. */
    versionNumber: number;
    /** Creation timestamp for the revision (ISO 8601). */
    createdAt: string;
    /** Optional timestamp when the revision was saved to disk. */
    savedAt?: string;
    /** Optional author identifier or display name. */
    author?: string;
    /** Filesystem path to the stored revision file. */
    filePath: string;
    /** True when this revision is the canonical/current revision for the resource. */
    isCanonical: boolean;
    /** Optional arbitrary metadata persisted alongside the revision (e.g., preserve flags). */
    metadata?: Record<string, unknown>;
}

export type AnyResource = TextResource | ImageResource | AudioResource | Folder;
