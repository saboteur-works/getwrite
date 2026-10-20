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

import { useState, useMemo, useRef } from "react";
import { validateProjectType } from "../../src/lib/models/schemas";
import {
  resolveProjectTypesTransport,
  type ProjectTypeConflict,
  type ProjectTypeSource,
  type ProjectTypesTransport,
  type ProjectTypeWriteRefusalReason,
} from "../../src/lib/api/project-types";
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
  /**
   * Where the item came from. Absent for an unsaved draft. An item with a
   * `fileName` and no `source` is treated as built-in (the safe side: it is
   * never overwritten or deleted).
   */
  source?: ProjectTypeSource;
  /** The definition as last loaded or saved; a saved type's id is fixed to it. */
  baseline?: ProjectTypeDefinition;
}

/** Why a save or delete did not happen, or was refused. */
export type DraftOperationFailure =
  | { ok: false; kind: "validation"; errors: string[] }
  | {
      ok: false;
      kind: "refused";
      reason: ProjectTypeWriteRefusalReason;
      message: string;
      conflictsWith?: ProjectTypeConflict;
    }
  | { ok: false; kind: "failed"; message: string };

/**
 * Result of a save. `copied` is true when a new saved type was created from
 * the item (a built-in, or an explicit copy); `original` is then the item the
 * copy was made from, reset to its last loaded definition.
 */
export type DraftSaveResult =
  | {
      ok: true;
      item: ProjectTypeListItem;
      copied: boolean;
      original?: ProjectTypeListItem;
    }
  | DraftOperationFailure;

/** Result of a delete. */
export type DraftDeleteResult = { ok: true } | DraftOperationFailure;

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
 * Collects every string message from a zod `format()` error tree, at any
 * depth (nested objects such as `editorConfig.body.lineHeight` carry their
 * messages in `_errors` arrays below the top level).
 */
function collectErrorMessages(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (Array.isArray(node)) return node.flatMap(collectErrorMessages);
  if (typeof node === "object" && node !== null) {
    return Object.values(node).flatMap(collectErrorMessages);
  }
  return [];
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
    const messages = collectErrorMessages(schemaResult.errors);

    return {
      valid: false,
      errors:
        messages.length > 0 ? messages : ["Invalid project type definition."],
    };
  }

  return { valid: true };
}

const BUILT_IN_DELETE_MESSAGE =
  "Built-in project types cannot be changed or deleted.";

function isSavedItem(item: ProjectTypeListItem): boolean {
  return item.fileName !== undefined && item.source === "saved";
}

function isBuiltInItem(item: ProjectTypeListItem): boolean {
  return item.fileName !== undefined && item.source !== "saved";
}

/**
 * Applies an edit to a definition. A saved type's id is fixed at the id it was
 * saved under (FR-10): rename is a change of `name`, never of `id`.
 *
 * @returns The definition to keep.
 */
export function applyDefinitionEdit(
  item: ProjectTypeListItem,
  next: ProjectTypeDefinition,
): ProjectTypeDefinition {
  if (!isSavedItem(item)) return next;
  const lockedId = item.baseline?.id ?? item.definition.id;
  return next.id === lockedId ? next : { ...next, id: lockedId };
}

const MAX_COPY_ID_LENGTH = 64;

/** Id and name for a copy, distinct from every listed item and the source. */
function copyIdentity(
  source: ProjectTypeDefinition,
  items: ProjectTypeListItem[],
): { id: string; name: string } {
  const ids = new Set<string>([source.id]);
  const names = new Set<string>([source.name.trim().toLowerCase()]);
  for (const listed of items) {
    ids.add(listed.definition.id);
    ids.add(listed.baseline?.id ?? listed.definition.id);
    names.add(listed.definition.name.trim().toLowerCase());
    names.add((listed.baseline?.name ?? "").trim().toLowerCase());
  }
  for (let n = 1; ; n += 1) {
    const idSuffix = n === 1 ? "-copy" : `-copy-${n}`;
    const nameSuffix = n === 1 ? " copy" : ` copy ${n}`;
    const id = `${source.id.slice(0, MAX_COPY_ID_LENGTH - idSuffix.length)}${idSuffix}`;
    const name = `${source.name}${nameSuffix}`;
    if (!ids.has(id) && !names.has(name.trim().toLowerCase())) {
      return { id, name };
    }
  }
}

function failureOf(error: unknown): DraftOperationFailure {
  return {
    ok: false,
    kind: "failed",
    message:
      error instanceof Error && error.message
        ? error.message
        : "The project type could not be saved.",
  };
}

function savedItemFrom(
  spec: ProjectTypeDefinition,
  fileName: string,
): ProjectTypeListItem {
  const definition = normalizeDefinition(spec);
  return {
    key: toItemKey(fileName, definition),
    fileName,
    definition,
    baseline: definition,
    source: "saved",
    hasChanges: false,
  };
}

/**
 * Saves a new type (POST) or an existing saved type (PUT on its original id).
 * A built-in is never overwritten: saving one creates a copy. The draft is
 * validated first and nothing is sent when it fails; a refusal or failure
 * returns a value and leaves the item as the writer left it.
 */
export async function saveDraftItem(
  item: ProjectTypeListItem,
  items: ProjectTypeListItem[],
  transport: ProjectTypesTransport,
): Promise<DraftSaveResult> {
  if (isBuiltInItem(item)) return saveDraftItemAsCopy(item, items, transport);

  const isSaved = isSavedItem(item);
  const definition = isSaved
    ? applyDefinitionEdit(item, item.definition)
    : item.definition;
  const validation = validateDraft(definition);
  if (!validation.valid) {
    return { ok: false, kind: "validation", errors: validation.errors };
  }
  try {
    const outcome = isSaved
      ? await transport.update(definition.id, definition)
      : await transport.create(definition);
    if (!outcome.ok) {
      return { ok: false, kind: "refused", ...refusalFields(outcome) };
    }
    return {
      ok: true,
      copied: false,
      item: savedItemFrom(outcome.spec ?? definition, outcome.fileName),
    };
  } catch (error) {
    return failureOf(error);
  }
}

function refusalFields(refusal: {
  reason: ProjectTypeWriteRefusalReason;
  message: string;
  conflictsWith?: ProjectTypeConflict;
}): {
  reason: ProjectTypeWriteRefusalReason;
  message: string;
  conflictsWith?: ProjectTypeConflict;
} {
  return refusal.conflictsWith
    ? {
        reason: refusal.reason,
        message: refusal.message,
        conflictsWith: refusal.conflictsWith,
      }
    : { reason: refusal.reason, message: refusal.message };
}

/**
 * Creates a new saved type from the item's current definition under an id and
 * name that differ from the source's and from every listed item (FR-11). The
 * source stays listed; for a built-in or saved source `original` is returned
 * reset to its last loaded definition.
 */
export async function saveDraftItemAsCopy(
  item: ProjectTypeListItem,
  items: ProjectTypeListItem[],
  transport: ProjectTypesTransport,
): Promise<DraftSaveResult> {
  const source = item.baseline ?? item.definition;
  const identity = copyIdentity(source, items);
  const definition: ProjectTypeDefinition = {
    ...item.definition,
    id: identity.id,
    name: identity.name,
  };
  const validation = validateDraft(definition);
  if (!validation.valid) {
    return { ok: false, kind: "validation", errors: validation.errors };
  }
  try {
    const outcome = await transport.create(definition);
    if (!outcome.ok) {
      return { ok: false, kind: "refused", ...refusalFields(outcome) };
    }
    const original: ProjectTypeListItem | undefined =
      item.fileName !== undefined
        ? {
            ...item,
            definition: normalizeDefinition(source),
            baseline: source,
            hasChanges: false,
          }
        : undefined;
    return {
      ok: true,
      copied: true,
      item: savedItemFrom(outcome.spec ?? definition, outcome.fileName),
      ...(original ? { original } : {}),
    };
  } catch (error) {
    return failureOf(error);
  }
}

/**
 * Deletes a saved type. A built-in is refused here, before any request; an
 * unsaved draft is dropped locally with no request.
 */
export async function deleteDraftItem(
  item: ProjectTypeListItem,
  transport: ProjectTypesTransport,
): Promise<DraftDeleteResult> {
  if (isBuiltInItem(item)) {
    return {
      ok: false,
      kind: "refused",
      reason: "built-in",
      message: BUILT_IN_DELETE_MESSAGE,
    };
  }
  if (!isSavedItem(item)) return { ok: true };
  try {
    const outcome = await transport.remove(
      item.baseline?.id ?? item.definition.id,
    );
    if (!outcome.ok) {
      return { ok: false, kind: "refused", ...refusalFields(outcome) };
    }
    return { ok: true };
  } catch (error) {
    return failureOf(error);
  }
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
  /** True while a save or delete request is in flight. */
  isWriting: boolean;
  /** Saves the selected item (a built-in is saved as a copy). */
  handleSave: () => Promise<DraftSaveResult | null>;
  /** Saves the selected item as a new type with a distinct id and name. */
  handleSaveAsCopy: () => Promise<DraftSaveResult | null>;
  /** Deletes the selected item (built-ins are refused). */
  handleDelete: () => Promise<DraftDeleteResult | null>;
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
  resolveTransport: () => Promise<ProjectTypesTransport> = resolveProjectTypesTransport,
): ProjectTypeDraftServiceState {
  const initialItems = useMemo<ProjectTypeListItem[]>(() => {
    return initialTemplates.map((template) => {
      const normalized = normalizeDefinition(template.definition);
      return {
        key: toItemKey(template.fileName, normalized),
        fileName: template.fileName,
        definition: normalized,
        baseline: normalized,
        source: template.source ?? "built-in",
        hasChanges: false,
      };
    });
  }, [initialTemplates]);

  const [items, setItems] = useState<ProjectTypeListItem[]>(initialItems);
  const [selectedKey, setSelectedKey] = useState<string>(
    initialItems[0]?.key ?? "",
  );

  const selectedItem = items.find((item) => item.key === selectedKey) ?? null;
  const [isWriting, setIsWriting] = useState(false);
  const writingRef = useRef(false);

  const updateSelectedDefinition = (
    updater: (current: ProjectTypeDefinition) => ProjectTypeDefinition,
  ): void => {
    setItems((previous) =>
      previous.map((item) => {
        if (item.key !== selectedKey) return item;

        const updatedDefinition = normalizeDefinition(
          applyDefinitionEdit(item, updater(item.definition)),
        );
        const nextKey = toItemKey(item.fileName, updatedDefinition);

        if (nextKey !== item.key) setSelectedKey(nextKey);

        return {
          ...item,
          key: nextKey,
          definition: updatedDefinition,
          hasChanges: true,
        };
      }),
    );
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
      folders: current.folders.filter((_, i) => i !== index),
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
        (_, i) => i !== index,
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
      statuses: (current.statuses ?? []).filter((_, i) => i !== index),
    }));
  };

  const handleUpdateStatus = (index: number, value: string): void => {
    updateSelectedDefinition((current) => ({
      ...current,
      statuses: (current.statuses ?? []).map((status, i) =>
        i === index ? value : status,
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
        (_, i) => i !== index,
      ),
    }));
  };

  /** Runs one write at a time; a second call while one is in flight is ignored. */
  const runWrite = async <T>(
    operation: (
      item: ProjectTypeListItem,
      transport: ProjectTypesTransport,
    ) => Promise<T>,
  ): Promise<T | null> => {
    if (!selectedItem || writingRef.current) return null;
    writingRef.current = true;
    setIsWriting(true);
    try {
      return await operation(selectedItem, await resolveTransport());
    } finally {
      writingRef.current = false;
      setIsWriting(false);
    }
  };

  const applySaved = (fromKey: string, result: DraftSaveResult): void => {
    if (!result.ok) return;
    setItems((previous) =>
      previous.flatMap((item) => {
        if (item.key !== fromKey) return [item];
        if (!result.copied) return [result.item];
        return result.original ? [result.original, result.item] : [result.item];
      }),
    );
    setSelectedKey(result.item.key);
  };

  const handleSave = (): Promise<DraftSaveResult | null> =>
    runWrite(async (item, transport) => {
      const result = await saveDraftItem(item, items, transport);
      applySaved(item.key, result);
      return result;
    });

  const handleSaveAsCopy = (): Promise<DraftSaveResult | null> =>
    runWrite(async (item, transport) => {
      const result = await saveDraftItemAsCopy(item, items, transport);
      applySaved(item.key, result);
      return result;
    });

  const handleDelete = (): Promise<DraftDeleteResult | null> =>
    runWrite(async (item, transport) => {
      const result = await deleteDraftItem(item, transport);
      if (result.ok) {
        const remaining = items.filter((i) => i.key !== item.key);
        setItems(remaining);
        setSelectedKey(remaining[0]?.key ?? "");
      }
      return result;
    });

  return {
    isWriting,
    handleSave,
    handleSaveAsCopy,
    handleDelete,
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
