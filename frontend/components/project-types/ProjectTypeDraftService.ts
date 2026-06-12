"use client";

/**
 * @module project-types/ProjectTypeDraftService
 *
 * In-memory draft management service for project type definitions.
 *
 * Responsibilities:
 * - Holds the pending draft list for ProjectTypesManagerPage.
 * - Tracks which items have unsaved local edits.
 * - Exposes a schema validation gate used before any commit.
 * - Pure service: no Redux dependency, no side effects beyond local state.
 *
 * Commit contract:
 * - Call `validateDraft(item)` before writing to disk.
 * - A draft whose definition fails the project-type schema must be rejected.
 *   Folder names carry no special semantics, so no particular folder is
 *   required.
 */

import { useState, useMemo } from "react";
import { validateProjectType } from "../../src/lib/models/schemas";
import type {
  ProjectTypeDefinition,
  ProjectTypeDefaultResource,
  ProjectTypeDefaultFolder,
  ProjectTypeFolder,
  ProjectTypeTemplateFile,
} from "../../src/types/project-types";

/**
 * Local list row shape used for sidebar rendering and draft tracking.
 */
export interface ProjectTypeListItem {
  /** Stable key for list rendering and selection. */
  key: string;
  /** Source file name, if this entry came from disk. */
  fileName?: string;
  /** Editable project type definition. */
  definition: ProjectTypeDefinition;
  /** Marks whether this item has local unsaved edits. */
  hasChanges: boolean;
}

/**
 * Result returned by the schema validation gate.
 */
export type DraftValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

/**
 * Creates an empty draft project type definition.
 *
 * @returns New project type draft seeded with a single starter folder the
 *   author can rename or remove. The folder carries no special semantics.
 */
export function createEmptyProjectType(): ProjectTypeDefinition {
  return {
    id: "",
    name: "",
    description: "",
    folders: [{ name: "Workspace" }],
    defaultFolders: [],
    defaultResources: [],
    statuses: [],
  };
}

/**
 * Creates a stable local key used for list item identity.
 *
 * @param fileName - Backing file name if present.
 * @param definition - Project type definition.
 * @returns Stable key string.
 */
export function toItemKey(
  fileName: string | undefined,
  definition: ProjectTypeDefinition,
): string {
  if (fileName) {
    return `file:${fileName}`;
  }

  if (definition.id.trim().length > 0) {
    return `draft:${definition.id}`;
  }

  return `draft:${definition.name || "untitled"}`;
}

/**
 * Ensures default resources and folders arrays are always present.
 *
 * @param definition - Project type definition to normalize.
 * @returns Normalized definition object.
 */
export function normalizeDefinition(
  definition: ProjectTypeDefinition,
): ProjectTypeDefinition {
  return {
    ...definition,
    folders: definition.folders ?? [],
    defaultFolders: definition.defaultFolders ?? [],
    defaultResources: definition.defaultResources ?? [],
    statuses: definition.statuses ?? [],
  };
}

/**
 * Validates a draft definition against the project-type schema.
 *
 * This function is the single gate applied before a draft is written to disk.
 * No particular folder is required — folder names carry no application
 * semantics.
 *
 * @param definition - Draft definition to validate.
 * @returns Validation result with a structured error list on failure.
 */
export function validateDraft(
  definition: ProjectTypeDefinition,
): DraftValidationResult {
  const schemaResult = validateProjectType(definition);
  if (!schemaResult.success) {
    const messages = Object.values(schemaResult.errors ?? {})
      .flatMap((entry) =>
        Array.isArray(entry)
          ? entry
          : typeof entry === "object" && entry !== null
            ? Object.values(entry).flat()
            : [],
      )
      .filter((msg): msg is string => typeof msg === "string");

    return {
      valid: false,
      errors:
        messages.length > 0 ? messages : ["Invalid project type definition."],
    };
  }

  return { valid: true };
}

/**
 * State and handlers returned by the draft service hook.
 */
export interface ProjectTypeDraftServiceState {
  items: ProjectTypeListItem[];
  selectedKey: string;
  selectedItem: ProjectTypeListItem | null;
  setSelectedKey: (key: string) => void;
  updateSelectedDefinition: (
    updater: (current: ProjectTypeDefinition) => ProjectTypeDefinition,
  ) => void;
  handleCreateProjectType: () => void;
  handleAddFolder: () => void;
  handleRemoveFolder: (index: number) => void;
  handleAddResource: () => void;
  handleRemoveResource: (index: number) => void;
  handleWordCountGoalChange: (value: number | undefined) => void;
  handleAddStatus: () => void;
  handleRemoveStatus: (index: number) => void;
  handleUpdateStatus: (index: number, value: string) => void;
  handleAddDefaultFolder: () => void;
  handleRemoveDefaultFolder: (index: number) => void;
}

/**
 * Custom hook encapsulating all draft state and mutation handlers for the
 * project type manager.
 *
 * @param initialTemplates - Templates loaded from disk to seed initial state.
 * @returns Draft service state and handlers.
 */
export function useProjectTypeDraftService(
  initialTemplates: ProjectTypeTemplateFile[],
): ProjectTypeDraftServiceState {
  const initialItems = useMemo<ProjectTypeListItem[]>(() => {
    return initialTemplates.map((template) => {
      const normalized = normalizeDefinition(template.definition);
      return {
        key: toItemKey(template.fileName, normalized),
        fileName: template.fileName,
        definition: normalized,
        hasChanges: false,
      };
    });
  }, [initialTemplates]);

  const [items, setItems] = useState<ProjectTypeListItem[]>(initialItems);
  const [selectedKey, setSelectedKey] = useState<string>(
    initialItems[0]?.key ?? "",
  );

  const selectedItem = items.find((item) => item.key === selectedKey) ?? null;

  const updateSelectedDefinition = (
    updater: (current: ProjectTypeDefinition) => ProjectTypeDefinition,
  ): void => {
    setItems((previous) => {
      return previous.map((item) => {
        if (item.key !== selectedKey) {
          return item;
        }

        const updatedDefinition = normalizeDefinition(updater(item.definition));

        const nextKey = toItemKey(item.fileName, updatedDefinition);
        if (nextKey !== item.key) {
          setSelectedKey(nextKey);
        }

        return {
          ...item,
          key: nextKey,
          definition: updatedDefinition,
          hasChanges: true,
        };
      });
    });
  };

  const handleCreateProjectType = (): void => {
    const definition = createEmptyProjectType();
    const timestamp = Date.now();
    const key = `draft:new-${timestamp}`;

    const nextItem: ProjectTypeListItem = { key, definition, hasChanges: true };

    setItems((previous) => [nextItem, ...previous]);
    setSelectedKey(key);
  };

  const handleAddFolder = (): void => {
    updateSelectedDefinition((current) => ({
      ...current,
      folders: [...current.folders, { name: "" } satisfies ProjectTypeFolder],
    }));
  };

  const handleRemoveFolder = (index: number): void => {
    updateSelectedDefinition((current) => ({
      ...current,
      folders: current.folders.filter(
        (_, folderIndex) => folderIndex !== index,
      ),
    }));
  };

  const handleAddResource = (): void => {
    updateSelectedDefinition((current) => ({
      ...current,
      defaultResources: [
        ...(current.defaultResources ?? []),
        {
          folder: "Workspace",
          name: "",
          type: "text",
          template: "",
        } satisfies ProjectTypeDefaultResource,
      ],
    }));
  };

  const handleRemoveResource = (index: number): void => {
    updateSelectedDefinition((current) => ({
      ...current,
      defaultResources: (current.defaultResources ?? []).filter(
        (_, resourceIndex) => resourceIndex !== index,
      ),
    }));
  };

  const handleWordCountGoalChange = (value: number | undefined): void => {
    updateSelectedDefinition((current) => ({
      ...current,
      wordCountGoal: value,
    }));
  };

  const handleAddStatus = (): void => {
    updateSelectedDefinition((current) => ({
      ...current,
      statuses: [...(current.statuses ?? []), ""],
    }));
  };

  const handleRemoveStatus = (index: number): void => {
    updateSelectedDefinition((current) => ({
      ...current,
      statuses: (current.statuses ?? []).filter(
        (_, statusIndex) => statusIndex !== index,
      ),
    }));
  };

  const handleUpdateStatus = (index: number, value: string): void => {
    updateSelectedDefinition((current) => ({
      ...current,
      statuses: (current.statuses ?? []).map((status, statusIndex) =>
        statusIndex === index ? value : status,
      ),
    }));
  };

  const handleAddDefaultFolder = (): void => {
    updateSelectedDefinition((current) => ({
      ...current,
      defaultFolders: [
        ...(current.defaultFolders ?? []),
        { folder: "Workspace", name: "" } satisfies ProjectTypeDefaultFolder,
      ],
    }));
  };

  const handleRemoveDefaultFolder = (index: number): void => {
    updateSelectedDefinition((current) => ({
      ...current,
      defaultFolders: (current.defaultFolders ?? []).filter(
        (_, folderIndex) => folderIndex !== index,
      ),
    }));
  };

  return {
    items,
    selectedKey,
    selectedItem,
    setSelectedKey,
    updateSelectedDefinition,
    handleCreateProjectType,
    handleAddFolder,
    handleRemoveFolder,
    handleAddResource,
    handleRemoveResource,
    handleWordCountGoalChange,
    handleAddStatus,
    handleRemoveStatus,
    handleUpdateStatus,
    handleAddDefaultFolder,
    handleRemoveDefaultFolder,
  };
}
