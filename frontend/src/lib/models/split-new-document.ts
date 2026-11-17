/**
 * @module split-new-document
 *
 * The new text document of "Split a document at the cursor" (Feature 120,
 * FR-3 and FR-10), and the function that removes it again for compensation.
 *
 * Creation: the document is made in the original's folder at the end of that
 * folder (max sibling `orderIndex` + 1), with its single canonical revision
 * `v-1` written through the same initial-revision path as any new text
 * document (`resource-initial-revision.ts`), then placed directly after the
 * original with `reorderResourcesCore` (`moveResource` cannot place within one
 * parent, `experiments/task-5.md`). The text it receives already carries fresh
 * ids (Task 12); it neither generates nor repairs ids.
 *
 * Sidecar: built from named keys, never a spread of the original's. It takes
 * the original's resource subtype and the `userMetadata` keys the choice
 * names, plus `wordCountGoal` when the choice names it; `entityKind`,
 * aliases, annotations and every other key are absent. `wordCount` is the
 * count derived from the text it is given. A name in the choice that the
 * original does not hold is absent, never invented. `copyResourceCore` is not
 * used (it spreads the whole sidecar, `experiments/task-3.md`).
 *
 * Name collision: resource names are not unique in this codebase (no write
 * path checks siblings), so a same-named sibling neither renames nor refuses.
 *
 * Writer model: the claim that nothing else writes the sibling order between
 * the read and the placement holds under one writer instance per tenant.
 *
 * No React, JSX, JSON or `node:*`.
 */
import { exists, readdir, rm } from "./io";
import { flushIndexer } from "./indexer-queue";
import { readFolderTree } from "./folder-utils";
import { removeResourceFromDiagnosticsIndex } from "./diagnostics-index";
import { isLockedAccessError } from "./locked-access";
import { createTextResource } from "./resource-factory";
import { getLocalResources } from "./resource-persistence";
import { writeResourceWithInitialRevision } from "./resource-initial-revision";
import {
  reorderResourcesCore,
  resolveResourceProjectRootOrThrow,
  type ReorderResourcesInput,
} from "./resource-crud-core";
import { isResourceId } from "./resource-id";
import { mutateSidecar, readSidecar } from "./sidecar";
import { purgeResource, softDeleteResource } from "./trash";
import { tiptapToPlainText } from "../tiptap-utils";
import type { MetadataValue, TipTapDocument } from "./types";

/** Sidecar key, named by a carry-over choice, that is not a `userMetadata` field. */
const WORD_COUNT_GOAL_KEY = "wordCountGoal";

/** Directories `softDeleteResource` may create, deepest first, relative to the project root. */
const TRASH_DIRS_DEEPEST_FIRST = [
  ".trash/meta",
  ".trash/resources",
  ".trash/revisions",
  ".trash",
] as const;

/** The original is missing, not a text document, or not readable. */
export class SplitOriginalError extends Error {
  constructor(detail: string) {
    super(`split original unusable: ${detail}`);
    this.name = "SplitOriginalError";
  }
}

/**
 * The new document could not be completed. `step` names the failing part;
 * `cleanedUp` says whether the document written so far was removed again.
 * `documentId` names the document that remains when it was not.
 */
export class SplitNewDocumentError extends Error {
  readonly step: "write" | "place";
  readonly cleanedUp: boolean;
  readonly documentId: string;
  constructor(
    step: "write" | "place",
    cleanedUp: boolean,
    documentId: string,
    cause: unknown,
  ) {
    super(`split new document failed at ${step}`, { cause });
    this.name = "SplitNewDocumentError";
    this.step = step;
    this.cleanedUp = cleanedUp;
    this.documentId = documentId;
  }
}

/** Removing the new document failed; `stage` names the part that did not finish. */
export class SplitNewDocumentRemoveError extends Error {
  readonly stage: "document" | "order";
  constructor(stage: "document" | "order", cause: unknown) {
    super(`split new document removal failed at ${stage}`, { cause });
    this.name = "SplitNewDocumentRemoveError";
    this.stage = stage;
  }
}

/** One item in the original's folder (a resource or a folder). */
export interface SplitSibling {
  id: string;
  kind: "resource" | "folder";
  orderIndex: number;
}

/** What {@link planSplitPlacement} decides. */
export interface SplitPlacementPlan {
  /** The renumber to send to `reorderResourcesCore`. Always holds the new document. */
  placement: ReorderResourcesInput;
  /** The siblings' values before the renumber (the new document is not in it). */
  previous: ReorderResourcesInput;
}

/** The default name of the new document: "<name> (part 2)". */
export function defaultSplitDocumentName(originalName: string): string {
  return `${originalName} (part 2)`;
}

/**
 * Pure placement: sorts the siblings by `orderIndex` (ties keep the given
 * order), puts the new document directly after the original and numbers the
 * sequence 0..n. Only siblings whose number changes are returned, with their
 * old values in `previous`. Every entry carries `folderId` (a folder entry
 * sent without it would reset that folder's parent to the root,
 * `experiments/task-5.md` H8).
 *
 * @throws When the original is not among the siblings.
 */
export function planSplitPlacement(
  siblings: readonly SplitSibling[],
  originalId: string,
  newId: string,
  parentId: string | null,
): SplitPlacementPlan {
  const sorted = [...siblings].sort((a, b) => a.orderIndex - b.orderIndex);
  const at = sorted.findIndex((s) => s.id === originalId);
  if (at === -1) throw new SplitOriginalError("not among its siblings");
  const sequence: Array<SplitSibling | null> = [
    ...sorted.slice(0, at + 1),
    null,
    ...sorted.slice(at + 1),
  ];
  const placement: ReorderResourcesInput = {
    folderOrder: [],
    resourceOrder: [],
  };
  const previous: ReorderResourcesInput = {
    folderOrder: [],
    resourceOrder: [],
  };
  sequence.forEach((sibling, index) => {
    if (sibling === null) {
      placement.resourceOrder.push({
        id: newId,
        orderIndex: index,
        folderId: parentId,
      });
      return;
    }
    if (sibling.orderIndex === index) return;
    const next = { id: sibling.id, orderIndex: index, folderId: parentId };
    const old = {
      id: sibling.id,
      orderIndex: sibling.orderIndex,
      folderId: parentId,
    };
    const target = sibling.kind === "folder" ? "folderOrder" : "resourceOrder";
    placement[target].push(next);
    previous[target].push(old);
  });
  return { placement, previous };
}

/** What the caller keeps to remove the new document again. */
export interface SplitNewDocumentUndo {
  documentId: string;
  /** Trash directories (relative to the project root) that existed before the creation. */
  preexistingTrashDirs: string[];
  /** The siblings' order before the placement. */
  previousOrder: ReorderResourcesInput;
}

/** Input of {@link createSplitDocument}. */
export interface SplitNewDocumentInput {
  originalId: string;
  /** The text after the cursor; its ids are already fresh (Task 12). */
  text: TipTapDocument;
  /** The name; the default is used when absent or blank. */
  newName?: string;
  /** Names of the metadata fields to carry: `userMetadata` keys and `wordCountGoal`. */
  carriedFields: readonly string[];
}

/** Result of {@link createSplitDocument}. */
export interface SplitNewDocumentResult {
  documentId: string;
  undo: SplitNewDocumentUndo;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeParent(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** Reads the items whose parent is `parentId`: resources first, then folders. */
async function readSiblings(
  projectRoot: string,
  parentId: string | null,
): Promise<SplitSibling[]> {
  const siblings: SplitSibling[] = [];
  for (const r of await getLocalResources(projectRoot)) {
    if (r.type === "folder") continue;
    if (normalizeParent(r.folderId) !== parentId) continue;
    siblings.push({ id: r.id, kind: "resource", orderIndex: r.orderIndex });
  }
  for (const raw of await readFolderTree(`${projectRoot}/folders`)) {
    if (!isRecord(raw)) continue;
    if (typeof raw.id !== "string" || typeof raw.orderIndex !== "number") {
      continue;
    }
    if (normalizeParent(raw.parentId) !== parentId) continue;
    siblings.push({ id: raw.id, kind: "folder", orderIndex: raw.orderIndex });
  }
  return siblings;
}

/** Names of the trash directories that exist now. */
async function existingTrashDirs(projectRoot: string): Promise<string[]> {
  const present: string[] = [];
  for (const dir of TRASH_DIRS_DEEPEST_FIRST) {
    if (await exists(`${projectRoot}/${dir}`)) present.push(dir);
  }
  return present;
}

/** The sidecar `userMetadata` of the original reduced to the named keys. */
function pickCarriedMetadata(
  original: Record<string, MetadataValue>,
  carriedFields: readonly string[],
): Record<string, MetadataValue> {
  const source: unknown = original.userMetadata;
  const picked: Record<string, MetadataValue> = {};
  if (!isRecord(source)) return picked;
  for (const name of carriedFields) {
    if (name === WORD_COUNT_GOAL_KEY) continue;
    if (!Object.prototype.hasOwnProperty.call(source, name)) continue;
    // Own keys only; structuredClone so the two sidecars share no object.
    Object.defineProperty(picked, name, {
      value: structuredClone(source[name]) as MetadataValue,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return picked;
}

/**
 * Creates the new document of a split in the original's folder and places it
 * directly after the original.
 *
 * If a step after the first write fails, the document written so far is
 * removed again and a {@link SplitNewDocumentError} says whether that worked.
 * A locked-access error is rethrown unchanged.
 *
 * @throws {SplitOriginalError} The original is missing or not a text document.
 * @throws {SplitNewDocumentError} A write or the placement failed.
 */
export async function createSplitDocument(
  projectId: string,
  input: SplitNewDocumentInput,
): Promise<SplitNewDocumentResult> {
  const projectRoot = resolveResourceProjectRootOrThrow(projectId);
  if (!isResourceId(input.originalId)) {
    throw new SplitOriginalError("invalid id");
  }
  const original = await readSidecar(projectRoot, input.originalId);
  if (original === null) throw new SplitOriginalError("no sidecar");
  if (original.type !== "text") throw new SplitOriginalError("not text");
  const parentId = normalizeParent(original.folderId);
  const siblings = await readSiblings(projectRoot, parentId);
  const preexistingTrashDirs = await existingTrashDirs(projectRoot);

  const originalName = typeof original.name === "string" ? original.name : "";
  const given = input.newName?.trim() ?? "";
  const resource = createTextResource({
    name: given === "" ? defaultSplitDocumentName(originalName) : given,
    folderId: parentId,
    plainText: tiptapToPlainText(input.text),
    tiptap: input.text,
    userMetadata: pickCarriedMetadata(original, input.carriedFields),
    orderIndex: Math.max(...siblings.map((s) => s.orderIndex)) + 1,
  });
  const subtype =
    typeof original.resourceSubtype === "string"
      ? original.resourceSubtype.trim()
      : "";
  if (subtype !== "") resource.resourceSubtype = subtype;

  const plan = planSplitPlacement(
    siblings,
    input.originalId,
    resource.id,
    parentId,
  );
  const undo: SplitNewDocumentUndo = {
    documentId: resource.id,
    preexistingTrashDirs,
    previousOrder: plan.previous,
  };

  let step: "write" | "place" = "write";
  try {
    await writeResourceWithInitialRevision(projectRoot, resource);
    const goal = original[WORD_COUNT_GOAL_KEY];
    if (
      input.carriedFields.includes(WORD_COUNT_GOAL_KEY) &&
      goal !== undefined
    ) {
      await mutateSidecar(projectRoot, resource.id, (current) => ({
        ...(current ?? {}),
        [WORD_COUNT_GOAL_KEY]: goal,
      }));
    }
    step = "place";
    await reorderResourcesCore(projectId, plan.placement);
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    let isCleanedUp = false;
    try {
      await removeSplitDocument(projectId, undo);
      isCleanedUp = true;
    } catch (cleanupErr) {
      if (isLockedAccessError(cleanupErr)) throw cleanupErr;
    }
    throw new SplitNewDocumentError(step, isCleanedUp, resource.id, err);
  }
  return { documentId: resource.id, undo };
}

/** Removes an empty directory; a missing or non-empty one is left alone. */
async function removeIfEmpty(path: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  if (entries.length === 0) await rm(path, { recursive: true });
}

/**
 * Removes the new document of a split and restores what its creation changed:
 * the document, its revision, sidecar and index entries (through Trash and a
 * purge, as measured in `experiments/task-5.md`), its diagnostics record, the
 * empty `.trash` directories the removal created, and the siblings' order.
 * `project.json`'s `metadataRevision` counter may stay higher (each sidecar
 * write advances it).
 *
 * @throws {SplitNewDocumentRemoveError} A stage failed; earlier stages took effect.
 */
export async function removeSplitDocument(
  projectId: string,
  undo: SplitNewDocumentUndo,
): Promise<void> {
  const projectRoot = resolveResourceProjectRootOrThrow(projectId);
  if (!isResourceId(undo.documentId)) {
    throw new SplitNewDocumentRemoveError(
      "document",
      new Error("invalid document id"),
    );
  }
  try {
    // Queued index tasks of the creation must finish first, or they would
    // write the removed document's entries back.
    await flushIndexer();
    await softDeleteResource(projectRoot, undo.documentId);
    await purgeResource(projectRoot, undo.documentId);
    await removeResourceFromDiagnosticsIndex(projectRoot, undo.documentId);
    for (const dir of TRASH_DIRS_DEEPEST_FIRST) {
      if (undo.preexistingTrashDirs.includes(dir)) continue;
      await removeIfEmpty(`${projectRoot}/${dir}`);
    }
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    throw new SplitNewDocumentRemoveError("document", err);
  }
  const { folderOrder, resourceOrder } = undo.previousOrder;
  if (folderOrder.length === 0 && resourceOrder.length === 0) return;
  try {
    await reorderResourcesCore(projectId, { folderOrder, resourceOrder });
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    throw new SplitNewDocumentRemoveError("order", err);
  }
}
