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
import {
  projectTypeFieldErrors,
  validateProjectType,
} from "../../src/lib/models/schemas";
import {
  resolveProjectTypesTransport,
  type ProjectTypeConflict,
  type ProjectTypeList,
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
  | {
      ok: false;
      kind: "validation";
      errors: string[];
      fieldErrors: Record<string, string>;
      unplacedErrors: string[];
    }
  | {
      ok: false;
      kind: "refused";
      reason: ProjectTypeWriteRefusalReason;
      message: string;
      conflictsWith?: ProjectTypeConflict;
      /** Server refusal messages keyed by schema path (see `fieldErrors` below). */
      fieldErrors?: Record<string, string>;
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
  | {
      valid: false;
      /** Every refusal message, flat. */
      errors: string[];
      /** Messages keyed by schema path, joined with "." (`statuses.1`). */
      fieldErrors: Record<string, string>;
      /** Messages with no input in the form: shown in the action bar. */
      unplacedErrors: string[];
    };

/**
 * Paths the editor form has an input for, and so can show an error beside:
 * the type name, a status label, a folder name, a subfolder name and parent,
 * and a starter document name. Any other path (the id, the folders list
 * itself, relationship types, subtypes, editor settings, folder-level starter
 * documents) has no such input, or is shown elsewhere, and goes to the action
 * bar.
 */
const FORM_FIELD_KEY =
  /^(name|statuses\.\d+|folders\.\d+\.name|defaultFolders\.\d+\.(name|folder)|defaultResources\.\d+\.name)$/;

/** True when the form shows an error for this schema-path key beside an input. */
export function isFormFieldKey(key: string): boolean {
  return FORM_FIELD_KEY.test(key);
}

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
    const { issues } = schemaResult;
    const unplaced = issues
      .filter((issue) => !isFormFieldKey(issue.path.join(".")))
      .map((issue) => issue.message);

    return {
      valid: false,
      errors:
        messages.length > 0 ? messages : ["Invalid project type definition."],
      fieldErrors: projectTypeFieldErrors(issues),
      unplacedErrors:
        messages.length > 0 ? unplaced : ["Invalid project type definition."],
    };
  }

  return { valid: true };
}

const BUILT_IN_DELETE_MESSAGE =
  "Built-in project types cannot be changed or deleted.";

/** The text label for where an item came from; never conveyed by colour alone. */
export function describeItemOrigin(
  item: ProjectTypeListItem,
): "Built-in" | "Saved" | "Draft" {
  if (item.fileName === undefined) return "Draft";
  return item.source === "saved" ? "Saved" : "Built-in";
}

/**
 * Rebuilds the item list from a server list. An item the writer has edited is
 * kept as edited (never overwritten by the server copy); drafts are kept; every
 * other item is replaced by the server's entry.
 */
export function mergeListIntoItems(
  items: ProjectTypeListItem[],
  list: ProjectTypeList,
): ProjectTypeListItem[] {
  const listed = new Set(list.entries.map((entry) => entry.fileName));
  const kept = items.filter(
    (item) =>
      item.fileName === undefined ||
      (item.hasChanges && !listed.has(item.fileName)),
  );
  const fromServer = list.entries.map((entry): ProjectTypeListItem => {
    const edited = items.find(
      (item) => item.fileName === entry.fileName && item.hasChanges,
    );
    if (edited) return edited;
    const definition = normalizeDefinition(entry.spec);
    return {
      key: toItemKey(entry.fileName, definition),
      fileName: entry.fileName,
      definition,
      baseline: definition,
      source: entry.source,
      hasChanges: false,
    };
  });
  return [...kept, ...fromServer];
}

/**
 * Drops every unsaved edit: an edited item returns to its last loaded
 * definition, an unsaved draft is removed, other items are untouched.
 */
export function discardAllEdits(
  items: ProjectTypeListItem[],
): ProjectTypeListItem[] {
  return items.flatMap((item): ProjectTypeListItem[] => {
    if (!item.hasChanges) return [item];
    if (item.fileName === undefined || item.baseline === undefined) return [];
    return [{ ...item, definition: item.baseline, hasChanges: false }];
  });
}

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
  typedName: string,
): { id: string; name: string } {
  // FR-8 comparison: trim, case-insensitive. A typed name that differs from the
  // source's is kept as written, even if it clashes with another type: the
  // write refuses it and the draft keeps what the writer typed.
  const shouldKeepTyped =
    typedName.trim().length > 0 &&
    typedName.trim().toLowerCase() !== source.name.trim().toLowerCase();
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
    const name = shouldKeepTyped ? typedName : `${source.name}${nameSuffix}`;
    if (
      !ids.has(id) &&
      (shouldKeepTyped || !names.has(name.trim().toLowerCase()))
    ) {
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
    return {
      ok: false,
      kind: "validation",
      errors: validation.errors,
      fieldErrors: validation.fieldErrors,
      unplacedErrors: validation.unplacedErrors,
    };
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
  fieldErrors?: Record<string, string>;
}): {
  reason: ProjectTypeWriteRefusalReason;
  message: string;
  conflictsWith?: ProjectTypeConflict;
  fieldErrors?: Record<string, string>;
} {
  return {
    reason: refusal.reason,
    message: refusal.message,
    ...(refusal.conflictsWith ? { conflictsWith: refusal.conflictsWith } : {}),
    ...(refusal.fieldErrors ? { fieldErrors: refusal.fieldErrors } : {}),
  };
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
  const identity = copyIdentity(source, items, item.definition.name);
  const definition: ProjectTypeDefinition = {
    ...item.definition,
    id: identity.id,
    name: identity.name,
  };
  const validation = validateDraft(definition);
  if (!validation.valid) {
    return {
      ok: false,
      kind: "validation",
      errors: validation.errors,
      fieldErrors: validation.fieldErrors,
      unplacedErrors: validation.unplacedErrors,
    };
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
  /** Replaces unedited items with the server's list; edits and drafts stay. */
  refreshFromList: (list: ProjectTypeList) => void;
  /** Drops every unsaved edit and removes unsaved drafts. */
  discardChanges: () => void;
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
  const [chosenKey, setSelectedKey] = useState<string>(
    initialItems[0]?.key ?? "",
  );
  // A refresh can drop the chosen item; fall back to the first one listed.
  const selectedKey = items.some((item) => item.key === chosenKey)
    ? chosenKey
    : (items[0]?.key ?? "");

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

  const refreshFromList = (list: ProjectTypeList): void => {
    setItems((previous) => mergeListIntoItems(previous, list));
  };

  const discardChanges = (): void => {
    setItems((previous) => discardAllEdits(previous));
  };

  return {
    isWriting,
    refreshFromList,
    discardChanges,
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
