/**
 * @module ProjectTypes
 *
 * Shared TypeScript models for project type template management.
 */

import { EditorBodyConfig, EditorHeading } from "../lib/models";

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
 * Metadata source configuration for a folder — controls how resource metadata
 * is gathered from resources within this folder.
 */
export interface ProjectTypeFolderMetadataSource {
  isMetadataSource: boolean;
  metadataInputType?: "text" | "multiselect" | "autocomplete";
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
   * Optional metadata source configuration.
   */
  metadataSource?: ProjectTypeFolderMetadataSource;
  /**
   * Optional default resources scoped to this folder.
   */
  defaultResources?: ProjectTypeDefaultResource[];
}

/**
 * Declaration of a subfolder to be created under a parent folder when a
 * project of this type is initialized.
 */
export interface ProjectTypeDefaultFolder {
  /**
   * Parent folder name (must match a folder in `ProjectTypeDefinition.folders`).
   */
  folder: string;
  /**
   * Display name for the subfolder.
   */
  name: string;
  /**
   * Marks that the subfolder is special to application semantics.
   */
  special?: boolean;
  /**
   * Optional metadata source configuration.
   */
  metadataSource?: ProjectTypeFolderMetadataSource;
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
  /**
   * Subfolders to create under parent folders when a project is initialized.
   */
  defaultFolders?: ProjectTypeDefaultFolder[];
  /**
   * Available status values for resources in this project type.
   */
  statuses?: string[];
  /**
   * Target word count goal for the project (e.g. 80000 for a novel).
   */
  wordCountGoal?: number;
  editorConfig?: {
    headings?: Record<string, EditorHeading>;
    body?: EditorBodyConfig;
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
