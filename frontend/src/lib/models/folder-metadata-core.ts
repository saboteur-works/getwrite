/**
 * @module folder-metadata-core
 *
 * Transport-agnostic core that reads and writes a folder's metadata sidecar,
 * `meta/folder-<id>.meta.json` (Feature 102, FR-1, FR-3, FR-4, FR-10, FR-15,
 * FR-33, FR-34). It is the only writer of that file.
 *
 * - One declared client-writable allowlist, {@link FOLDER_METADATA_WRITABLE_KEYS}.
 *   A payload carrying any other key is refused with a message before any
 *   lock or write.
 * - Notes are plain text at `userMetadata.notes` only. The top-level `notes`
 *   of `ResourceBase` and `Folder` is never set or read.
 * - A subtype is stored under the top-level `resourceSubtype`, matched
 *   against `config.subtypes` with `normalizeSubtypeLabel` and stored in the
 *   list's spelling. Removing a subtype from the list rewrites nothing.
 * - Writes take `withMetaLock(projectRoot)` then the sidecar's file lock, and
 *   read the stored value inside it (the order of `sidecar.ts`
 *   `mutateSidecar`). `folder.json` is never touched.
 * - The project root comes from a validated `projectId`; the folder id is
 *   checked to be a UUID before a path is built.
 * - Locked-access errors are not caught and propagate unchanged. Nothing
 *   stored and no error text is logged.
 */
import path from "node:path";
import { atomicWriteFile, mkdir, readFile } from "./io";
import { withMetaLock } from "./meta-locks";
import { withFileLock } from "./file-lock";
import { resolveProjectRoot } from "./project-root-resolver";
import { InvalidProjectIdCoreError } from "./project-crud-core";
import { isResourceId } from "./resource-id";
import { listFolderDescriptors } from "./backlinks";
import { isLabelInList, normalizeSubtypeLabel } from "./field-subtype-scope";
import {
  folderSidecarPathForProject,
  readFolderSidecar,
  type FolderSidecarValue,
} from "./sidecar";
import {
  FolderSidecarSchema,
  MetadataValue as MetadataValueSchema,
} from "./schemas";
import type { MetadataValue } from "./types";

export { InvalidProjectIdCoreError };
export type { FolderSidecarValue };

/** The one list of keys a client may write to a folder's metadata. */
export const FOLDER_METADATA_WRITABLE_KEYS = [
  "notes",
  "fieldValues",
  "resourceSubtype",
] as const;

/** A validated client write. `resourceSubtype: null` clears the subtype. */
interface FolderMetadataWrite {
  notes?: string;
  fieldValues?: Record<string, MetadataValue>;
  resourceSubtype?: string | null;
}

/** A folder metadata write was refused at the boundary. Map to HTTP 400. */
export class InvalidFolderMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFolderMetadataError";
  }
}

/**
 * A folder write named an id with no folder in the tree (Owner decision,
 * 2026-11-07, FR-3). Map to HTTP 404; the same message is thrown on native.
 */
export class FolderNotFoundError extends Error {
  constructor() {
    super("Folder not found");
    this.name = "FolderNotFoundError";
  }
}

const RESERVED_FIELD_KEYS: readonly string[] = ["notes", "__proto__"];

function requireProjectRoot(projectId: string): string {
  const root = resolveProjectRoot(projectId);
  if (!root) throw new InvalidProjectIdCoreError(projectId);
  return root;
}

function requireFolderId(folderId: string): void {
  if (!isResourceId(folderId)) {
    throw new InvalidFolderMetadataError("Invalid folder id");
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateFieldValues(value: unknown): Record<string, MetadataValue> {
  if (!isPlainObject(value)) {
    throw new InvalidFolderMetadataError("fieldValues must be an object");
  }
  const out: Record<string, MetadataValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key.trim() === "" || RESERVED_FIELD_KEYS.includes(key)) {
      throw new InvalidFolderMetadataError(
        `fieldValues key "${key}" is not allowed`,
      );
    }
    const parsed = MetadataValueSchema.safeParse(entry);
    if (!parsed.success) {
      throw new InvalidFolderMetadataError(
        `fieldValues value for "${key}" is not a valid metadata value`,
      );
    }
    out[key] = parsed.data as MetadataValue;
  }
  return out;
}

/**
 * Refuses a write for an id that names no folder under `folders/`, or in a
 * project with no `project.json`. `project.json` is read first because an
 * absent `folders/` directory reads as no folders even when the project is
 * locked; the read makes a locked project raise its locked-access error
 * instead of "not found". A failed descriptor read raises its own error and a
 * locked-access error propagates; neither is reported as "not found".
 */
async function requireFolderExists(
  projectRoot: string,
  folderId: string,
): Promise<void> {
  try {
    await readFile(path.join(projectRoot, "project.json"), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new FolderNotFoundError();
    }
    throw err;
  }
  const folders = await listFolderDescriptors(projectRoot);
  if (!folders.some((folder) => folder.id === folderId)) {
    throw new FolderNotFoundError();
  }
}

/** Boundary validation of the shape and keys, before any read, lock or write. */
function validateWrite(payload: unknown): FolderMetadataWrite {
  if (!isPlainObject(payload)) {
    throw new InvalidFolderMetadataError("Folder metadata must be an object");
  }
  const allowed: readonly string[] = FOLDER_METADATA_WRITABLE_KEYS;
  for (const key of Object.keys(payload)) {
    if (!allowed.includes(key)) {
      throw new InvalidFolderMetadataError(
        `"${key}" is not writable on folder metadata`,
      );
    }
  }
  const write: FolderMetadataWrite = {};
  if ("notes" in payload) {
    if (typeof payload.notes !== "string") {
      throw new InvalidFolderMetadataError("notes must be a string");
    }
    write.notes = payload.notes;
  }
  if ("fieldValues" in payload) {
    write.fieldValues = validateFieldValues(payload.fieldValues);
  }
  if ("resourceSubtype" in payload) {
    const subtype = payload.resourceSubtype;
    if (subtype !== null && (typeof subtype !== "string" || !subtype.trim())) {
      throw new InvalidFolderMetadataError(
        "resourceSubtype must be a non-blank string, or null to clear it",
      );
    }
    write.resourceSubtype = subtype as string | null;
  }
  return write;
}

/**
 * Resolve a subtype against the project's own list (`config.subtypes`) under
 * `normalizeSubtypeLabel`; returns the list's spelling. A label not in the
 * list is refused. A locked-access error from the read propagates.
 */
async function resolveSubtype(
  projectRoot: string,
  label: string,
): Promise<string> {
  const raw = await readFile(path.join(projectRoot, "project.json"), "utf8");
  const config = (JSON.parse(raw) as { config?: { subtypes?: unknown } })
    .config;
  const list = Array.isArray(config?.subtypes)
    ? config.subtypes.filter((s): s is string => typeof s === "string")
    : [];
  if (!isLabelInList(label, list)) {
    throw new InvalidFolderMetadataError(
      "resourceSubtype is not in the project's subtype list",
    );
  }
  const key = normalizeSubtypeLabel(label);
  return list.find((entry) => normalizeSubtypeLabel(entry) === key) as string;
}

function buildStored(
  current: FolderSidecarValue,
  write: FolderMetadataWrite,
  subtype: string | null | undefined,
): { stored: Record<string, unknown>; value: FolderSidecarValue } {
  const fieldValues = { ...current.fieldValues, ...(write.fieldValues ?? {}) };
  const notes = write.notes ?? current.notes;
  const resourceSubtype =
    subtype === undefined ? current.resourceSubtype : (subtype ?? undefined);
  const userMetadata: Record<string, MetadataValue> = { ...fieldValues };
  if (notes !== "") userMetadata.notes = notes;
  const stored: Record<string, unknown> = {};
  if (Object.keys(userMetadata).length > 0) stored.userMetadata = userMetadata;
  if (resourceSubtype !== undefined) stored.resourceSubtype = resourceSubtype;
  FolderSidecarSchema.parse(stored);
  return { stored, value: { notes, fieldValues, resourceSubtype } };
}

/**
 * Read a folder's metadata. An absent sidecar reads as empty and creates
 * nothing; an unreadable one raises `FolderSidecarUnreadableError`.
 *
 * @throws InvalidProjectIdCoreError, InvalidFolderMetadataError; locked-access
 *   errors are rethrown unchanged.
 */
export async function getFolderMetadataCore(
  projectId: string,
  folderId: string,
): Promise<FolderSidecarValue> {
  const projectRoot = requireProjectRoot(projectId);
  requireFolderId(folderId);
  return readFolderSidecar(projectRoot, folderId);
}

/**
 * Merge a validated client write into a folder's sidecar: read inside
 * `withMetaLock` then the sidecar's file lock, atomic write, release. The
 * first write creates the sidecar. An empty payload writes nothing.
 *
 * @throws InvalidProjectIdCoreError, InvalidFolderMetadataError,
 *   FolderNotFoundError (no folder has this id; no sidecar is created),
 *   FolderSidecarUnreadableError (the stored file is left as it is);
 *   locked-access errors are rethrown unchanged.
 */
export async function updateFolderMetadataCore(
  projectId: string,
  folderId: string,
  payload: unknown,
): Promise<FolderSidecarValue> {
  const projectRoot = requireProjectRoot(projectId);
  requireFolderId(folderId);
  const write = validateWrite(payload);
  const subtype =
    typeof write.resourceSubtype === "string"
      ? await resolveSubtype(projectRoot, write.resourceSubtype)
      : write.resourceSubtype;
  if (Object.keys(write).length === 0) {
    await requireFolderExists(projectRoot, folderId);
    return readFolderSidecar(projectRoot, folderId);
  }
  const filePath = folderSidecarPathForProject(projectRoot, folderId);
  return withMetaLock(projectRoot, () =>
    withFileLock(filePath, async () => {
      await requireFolderExists(projectRoot, folderId);
      const current = await readFolderSidecar(projectRoot, folderId);
      const { stored, value } = buildStored(current, write, subtype);
      await mkdir(path.join(projectRoot, "meta"), { recursive: true });
      await atomicWriteFile(filePath, JSON.stringify(stored, null, 2), "utf8");
      return value;
    }),
  );
}
