/**
 * @module ProjectTypes
 *
 * Shared TypeScript models for project type template management.
 */

import { EditorHeading } from "../lib/models";

/**
 * Supported resource content types for default project resources.
 */
export type ProjectTypeResourceKind = "text" | "image" | "audio";

/**
 * Definition for a default resource created by a project type.
 */
export interface ProjectTypeDefaultResource {
    /**
     * Folder name where this resource will be created.
     */
    folder: string;
    /**
     * Human-readable resource name.
     */
    name: string;
    /**
     * Resource content kind.
     */
    type: ProjectTypeResourceKind;
    /**
     * Optional initial template content.
     */
    template?: string;
    /**
     * Optional arbitrary metadata.
     */
    metadata?: Record<string, unknown>;
}

/**
 * Folder definition within a project type.
 */
export interface ProjectTypeFolder {
    /**
     * Folder display name.
     */
    name: string;
    /**
     * Marks that the folder is special to application semantics.
     */
    special?: boolean;
    /**
     * Optional default resources scoped to this folder.
     */
    defaultResources?: ProjectTypeDefaultResource[];
}

/**
 * Primary project type template model consumed by the management UI.
 */
export interface ProjectTypeDefinition {
    /**
     * Stable machine identifier.
     */
    id: string;
    /**
     * Human-facing display name.
     */
    name: string;
    /**
     * Optional project type description.
     */
    description?: string;
    /**
     * Ordered folder definitions.
     */
    folders: ProjectTypeFolder[];
    /**
     * Optional top-level default resources.
     */
    defaultResources?: ProjectTypeDefaultResource[];
    editorConfig?: {
        headings?: Record<string, EditorHeading>;
    };
}

/**
 * Serialized source template file with parsed project type.
 */
export interface ProjectTypeTemplateFile {
    /**
     * Template file basename.
     */
    fileName: string;
    /**
     * Parsed project type payload.
     */
    definition: ProjectTypeDefinition;
}
