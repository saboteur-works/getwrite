// Last Updated: 2026-07-26

/**
 * @module resource-crud-core
 *
 * **ADR-021 Phase 2 (Task 3) — transport-agnostic resource CRUD core.** The
 * business logic behind eight routes: `app/api/resource/route.ts` (POST —
 * create), `app/api/resource/upload/route.ts` (POST — media upload),
 * `app/api/resource/[resource-id]/route.ts` (POST — copy/delete),
 * `app/api/resource/[resource-id]/sidecar/route.ts` (POST — sidecar update),
 * `app/api/resource/[resource-id]/rename/route.ts` (POST — folder/resource
 * rename), `app/api/project-resources/route.ts` (POST — content + revisions
 * fetch), and `app/api/projects/[projectId]/reorder/route.ts` (POST —
 * folder/resource reorder), lifted so it can be reused by both the HTTP
 * routes (web/desktop) and the native in-process transport
 * (`store/transport/native-resource-backend.ts`) with byte-for-byte
 * identical filesystem behavior.
 *
 * This module has no `next`/`NextRequest`/`NextResponse` import and never
 * constructs a `Response`. Every function operates on plain arguments and
 * throws plain `Error`s (or the typed errors below). The routes catch those
 * errors and map them to their existing HTTP status codes; the native
 * backend lets them propagate directly to the caller.
 *
 * Every operation resolves a project's on-disk root via
 * {@link resolveProjectRoot} (directory-basename convention — ADR-017/018)
 * and throws the shared `InvalidProjectIdCoreError` (imported from
 * `project-crud-core.ts` rather than re-declared here) when the supplied
 * `projectId` is not a well-formed UUID.
 */
import path from "node:path";
import type { Dirent } from "node:fs";
import { cp, exists, readdir, readFile, stat, writeFile } from "./io";
import { resolveProjectRoot } from "./project-root-resolver";
import { InvalidProjectIdCoreError } from "./project-crud-core";
import { withMetaLock } from "./meta-locks";
import {
  createResourceOfType,
  writeResourceToFile,
  type CreateResourceOpts,
} from ".";
import { isPlainFileName, validateMediaFile } from "./media-validation";
import { extractAudioMetadata, extractImageMetadata } from "./media-metadata";
import { listRevisions } from "./revision";
import {
  writeInitialCanonicalRevision,
  writeResourceWithInitialRevision,
} from "./resource-initial-revision";
import { loadResourceContent } from "../tiptap-utils";
import { plainTextToTipTapDocument } from "./tiptap-doc";
import {
  SIDECAR_UNCHANGED,
  mutateSidecar,
  readSidecar,
  sidecarPathForProject,
  writeSidecar,
} from "./sidecar";
import { ResourceGoneError } from "./resource-gone-error";
import { isLockedAccessError } from "./locked-access";
import { removeEntityGraphPositionForEntity } from "./entity-graph-positions";
import { renameFolderById } from "./folder-utils";
import { getEffectiveResourceRefFieldKeys } from "./metadata-schema";
import {
  nullifyResourceRefs,
  softDeleteFolder,
  softDeleteResource,
  writeTrashRefRecord,
} from "./trash";
import { generateUUID } from "./uuid";
import type {
  AnyResource,
  MetadataValue,
  TipTapDocument,
  Revision,
} from "./types";

/**
 * Resolves `projectId` to its on-disk project root, throwing (rather than
 * returning a `Response`, which the HTTP routes do via `resolveProjectPath`)
 * when it is not a well-formed UUID.
 *
 * Shares {@link InvalidProjectIdCoreError} with `project-crud-core.ts`
 * rather than declaring a resource-specific equivalent, so every lifted
 * core's routes can use a single `instanceof` check ->
 * `respondInvalidProjectId()` mapping.
 */
// Re-exported so every route/native backend in this module's scope can
// `import { InvalidProjectIdCoreError } from "./resource-crud-core"` without
// also reaching into `project-crud-core.ts` directly.
export { InvalidProjectIdCoreError };

export function resolveResourceProjectRootOrThrow(projectId: string): string {
  const projectRoot = resolveProjectRoot(projectId);
  if (!projectRoot) {
    throw new InvalidProjectIdCoreError(projectId);
  }
  return projectRoot;
}

/**
 * Thrown by {@link createResourceCore} and {@link uploadMediaResourceCore}
 * when `projectId` is a well-formed UUID but names no project: the resolved
 * directory has no `project.json`. Routes map it to 404.
 */
export class ResourceProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`project not found: ${projectId}`);
    this.name = "ResourceProjectNotFoundError";
  }
}

/**
 * Refuses to create into a project that does not exist. Without it, the
 * create paths' recursive writes made a new project directory for any
 * well-formed `projectId` (POS note_15ea8496). Only ENOENT means "missing";
 * any other error, a locked-access error included, propagates.
 */
async function assertProjectExists(
  projectRoot: string,
  projectId: string,
): Promise<void> {
  try {
    await stat(path.join(projectRoot, "project.json"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ResourceProjectNotFoundError(projectId);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 1. Create resource
// ---------------------------------------------------------------------------

/**
 * Creates a new resource, persists it, and — for text resources — writes its
 * initial canonical revision.
 *
 * Lifted verbatim from `POST /api/resource`'s `handlePost` body (minus the
 * request-JSON parsing and try/catch -> 500 status mapping, which stay in
 * the route).
 */
export async function createResourceCore(
  projectId: string,
  resourceData: CreateResourceOpts,
): Promise<AnyResource> {
  const projectPath = resolveResourceProjectRootOrThrow(projectId);
  await assertProjectExists(projectPath, projectId);
  for (const name of [resourceData.image?.file, resourceData.audio?.file]) {
    if (name !== undefined && !isPlainFileName(name)) {
      throw new InvalidResourceFileNameCoreError();
    }
  }

  const resource = createResourceOfType(resourceData.type, resourceData);
  await writeResourceWithInitialRevision(projectPath, resource);

  return resource;
}

// ---------------------------------------------------------------------------
// 2. Upload media resource
// ---------------------------------------------------------------------------

/**
 * Thrown by {@link createResourceCore} when `image.file` or `audio.file` is
 * not a bare file name ({@link isPlainFileName}). Routes map it to 400.
 */
export class InvalidResourceFileNameCoreError extends Error {
  constructor() {
    super("Media file name must be a bare file name.");
    this.name = "InvalidResourceFileNameCoreError";
  }
}

/** Thrown by {@link uploadMediaResourceCore} when the file fails validation. */
export class MediaUploadValidationError extends Error {
  reason: string;
  constructor(message: string, reason: string) {
    super(message);
    this.name = "MediaUploadValidationError";
    this.reason = reason;
  }
}

/**
 * Plain-argument input for {@link uploadMediaResourceCore}: raw bytes plus
 * already-extracted fields, since native has no multipart request to parse.
 * The HTTP route continues to do `req.formData()` + `file.arrayBuffer()`
 * itself and passes the resulting bytes/fields here.
 */
export interface UploadMediaResourceInput {
  /** The uploaded file's raw bytes. */
  fileBytes: Uint8Array;
  /** The uploaded file's original filename (used for extension + fallback title). */
  fileName: string;
  /** The uploaded file's reported MIME type, if any. */
  mimeType?: string;
  /** The uploaded file's size in bytes. */
  fileSize: number;
  /** Optional display title; falls back to the filename minus its extension. */
  title?: string;
  folderId?: string;
}

/** Strips a trailing file extension to derive a display name. */
function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, "");
}

/**
 * Creates an image/audio resource from already-extracted upload bytes and
 * fields.
 *
 * Lifted verbatim from `POST /api/resource/upload`'s `handlePost` body,
 * minus multipart parsing (the `file instanceof File` check, `formData()`
 * extraction, and `file.arrayBuffer()`), which stay in the route — native
 * callers already have `fileBytes` in-process.
 *
 * @throws {MediaUploadValidationError} When `validateMediaFile` rejects the file.
 */
export async function uploadMediaResourceCore(
  projectId: string,
  input: UploadMediaResourceInput,
): Promise<AnyResource> {
  const projectPath = resolveResourceProjectRootOrThrow(projectId);
  await assertProjectExists(projectPath, projectId);

  const validation = validateMediaFile({
    mime: input.mimeType || undefined,
    ext: input.fileName,
    size: input.fileSize,
  });
  if (!validation.ok) {
    throw new MediaUploadValidationError(validation.message, validation.reason);
  }

  const name =
    typeof input.title === "string" && input.title.trim().length > 0
      ? input.title.trim()
      : stripExtension(input.fileName) || "Untitled";
  const folderId =
    typeof input.folderId === "string" && input.folderId.length > 0
      ? input.folderId
      : undefined;

  const bytes = input.fileBytes;
  const fileName = `original.${validation.extension}`;

  const resource =
    validation.type === "image"
      ? createResourceOfType("image", {
          name,
          type: "image",
          folderId,
          image: { file: fileName, ...(await extractImageMetadata(bytes)) },
        })
      : createResourceOfType("audio", {
          name,
          type: "audio",
          folderId,
          audio: {
            file: fileName,
            ...(await extractAudioMetadata(bytes, validation.extension)),
          },
        });

  // writeResourceToFile serializes its sidecar write via the per-project
  // meta lock internally, so no outer lock is needed here (and adding one
  // would deadlock, since the lock is non-reentrant).
  await writeResourceToFile(projectPath, resource, { binary: bytes });

  return resource;
}

// ---------------------------------------------------------------------------
// 3. Copy resource
// ---------------------------------------------------------------------------

/**
 * Copies a resource's on-disk content directory (if any) and sidecar under a
 * newly generated id.
 *
 * Lifted from `POST /api/resource/[resource-id]`'s local `copyResource`
 * helper. A text copy also gets its own initial canonical revision (FR-28),
 * and a text source with no content files is rejected before any write.
 */
export async function copyResourceCore(
  projectId: string,
  sourceId: string,
  newName: string,
): Promise<Record<string, MetadataValue>> {
  const projectRoot = resolveResourceProjectRootOrThrow(projectId);

  const newId = generateUUID();
  const srcDir = path.join(projectRoot, "resources", sourceId);
  const dstDir = path.join(projectRoot, "resources", newId);

  // All reads complete before the first write (FR-33).
  const sourceSidecar = await readSidecar(projectRoot, sourceId);
  const isText = sourceSidecar?.type === "text";
  if (isText) {
    const content = await loadResourceContent(projectRoot, sourceId);
    if (content.tiptap === undefined && content.plainText === undefined) {
      throw new Error(
        `Cannot copy text resource ${sourceId}: it has no content files to copy.`,
      );
    }
  }

  if (await exists(srcDir)) {
    await cp(srcDir, dstDir, { recursive: true });
  }

  const newSidecar = {
    ...(sourceSidecar ?? {}),
    id: newId,
    name: newName,
    createdAt: new Date().toISOString(),
  };

  await writeSidecar(projectRoot, newId, newSidecar);

  if (isText) {
    // The revision holds the copy's own document, written last (FR-28).
    const copied = await loadResourceContent(projectRoot, newId);
    await writeInitialCanonicalRevision(
      projectRoot,
      newId,
      copied.tiptap ?? plainTextToTipTapDocument(copied.plainText ?? ""),
    );
  }
  return newSidecar;
}

// ---------------------------------------------------------------------------
// 4. Delete resource
// ---------------------------------------------------------------------------

/**
 * Soft-deletes a resource, nullifying any resource-ref fields that pointed
 * at it first.
 *
 * Lifted verbatim from `POST /api/resource/[resource-id]`'s `"delete"`
 * action branch.
 */
export async function deleteResourceCore(
  projectId: string,
  resourceId: string,
): Promise<void> {
  const projectRoot = resolveResourceProjectRootOrThrow(projectId);

  // Read the resource name and resource-ref field keys before deletion.
  const sidecar = await readSidecar(projectRoot, resourceId);
  const deletedName = typeof sidecar?.name === "string" ? sidecar.name : "";

  let resourceRefKeys: string[] = [];
  try {
    resourceRefKeys = await getEffectiveResourceRefFieldKeys(projectRoot);
  } catch {
    // Schema unreadable — proceed without nullification
  }

  const clearedEntries = await nullifyResourceRefs(
    projectRoot,
    resourceId,
    deletedName,
    resourceRefKeys,
  );

  // FR-8 (clarified at Gate 6): every delete going through this path writes
  // a ref record, even one with an empty `entries` array when nothing was
  // nullified — mirroring `softDeleteFolder`'s per-descendant loop in
  // `trash.ts`, which already did this. Total record absence is reserved
  // exclusively for legacy items (FR-22).
  await writeTrashRefRecord(projectRoot, resourceId, clearedEntries);

  await softDeleteResource(projectRoot, resourceId);
}

// ---------------------------------------------------------------------------
// 5. Update sidecar
// ---------------------------------------------------------------------------

/**
 * Sidecar keys derived by the server (the canonical save in
 * `revision-core.ts` writes `wordCount`; upload writes a media resource's
 * `file`, which the file route joins into a path). A client sidecar update never
 * supplies them: they are dropped from the update before the merge, so the
 * stored value is left as the canonical save wrote it. `updatedAt` is not
 * listed: a client-sent `updatedAt` was read in the code path but not
 * observed (experiments.md, Part B).
 */
const SERVER_DERIVED_SIDECAR_KEYS: readonly string[] = ["wordCount", "file"];

/**
 * Allowlist of sidecar keys {@link updateSidecarCore}'s `clearKeys` parameter
 * may name. A fail-closed boundary: any key outside this list — including
 * structural fields like `orderIndex`/`folderId` or the resource's `id` —
 * is rejected rather than silently ignored or coerced (FR-20/FR-25,
 * `docs/standards/security.md`).
 */
const SIDECAR_CLEARABLE_KEYS: readonly string[] = [
  "entityKind",
  "aliases",
  "wordCountGoal",
  "resourceSubtype",
];

/**
 * Thrown by {@link updateSidecarCore} when `updatedResource.resourceSubtype`
 * is present but not a non-blank string (FR-7). Thrown before any
 * read-modify-write occurs, so the sidecar is left unchanged.
 */
export class InvalidResourceSubtypeCoreError extends Error {
  constructor() {
    super("resourceSubtype must be a non-blank string");
    this.name = "InvalidResourceSubtypeCoreError";
  }
}

/**
 * Returns `updatedResource` with `resourceSubtype` trimmed, or the same
 * object when the key is absent. A present key whose value is not a string,
 * or is blank after trimming, throws {@link InvalidResourceSubtypeCoreError};
 * clearing is done via `clearKeys`, never by a blank value.
 */
function normalizeResourceSubtype(
  updatedResource: Record<string, unknown>,
): Record<string, unknown> {
  if (
    !Object.prototype.hasOwnProperty.call(updatedResource, "resourceSubtype")
  ) {
    return updatedResource;
  }
  const value = updatedResource.resourceSubtype;
  if (typeof value !== "string" || value.trim() === "") {
    throw new InvalidResourceSubtypeCoreError();
  }
  return { ...updatedResource, resourceSubtype: value.trim() };
}

/**
 * Thrown by {@link updateSidecarCore} when `clearKeys` is malformed (not an
 * array of strings) or names a key outside {@link SIDECAR_CLEARABLE_KEYS}.
 * Thrown before any read-modify-write occurs, so no mutation of the sidecar
 * happens on rejection.
 */
export class InvalidClearKeysCoreError extends Error {
  constructor(clearKeys: unknown) {
    super(`Invalid clearKeys: ${JSON.stringify(clearKeys)}`);
    this.name = "InvalidClearKeysCoreError";
  }
}

/**
 * Validates `clearKeys` against {@link SIDECAR_CLEARABLE_KEYS}, throwing
 * {@link InvalidClearKeysCoreError} when it is not an array of strings or
 * contains an entry outside the allowlist. Returns `undefined` unchanged
 * when `clearKeys` itself is `undefined` (the omitted-parameter case).
 */
function validateClearKeys(clearKeys: string[] | undefined): void {
  if (clearKeys === undefined) return;
  if (
    !Array.isArray(clearKeys) ||
    !clearKeys.every((key) => typeof key === "string")
  ) {
    throw new InvalidClearKeysCoreError(clearKeys);
  }
  for (const key of clearKeys) {
    if (!SIDECAR_CLEARABLE_KEYS.includes(key)) {
      throw new InvalidClearKeysCoreError(clearKeys);
    }
  }
}

function omitServerDerivedKeys(
  update: Record<string, unknown>,
): Record<string, unknown> {
  const kept: Record<string, unknown> = { ...update };
  for (const key of SERVER_DERIVED_SIDECAR_KEYS) {
    delete kept[key];
  }
  return kept;
}

/**
 * Reads the stored sidecar inside the sidecar sink, merges `buildUpdate`'s
 * result over it (keeping `orderIndex` and `folderId` from the stored value),
 * applies `clearKeys` and writes. A locked-access error propagates and nothing
 * is written; an unreadable sidecar is replaced, as before.
 *
 * @throws {ResourceGoneError} When no sidecar file exists (checked inside the
 *   lock): the resource was deleted or never existed. Nothing is written.
 */
async function mergeSidecarUpdate(
  projectRoot: string,
  resourceId: string,
  buildUpdate: (
    existing: Record<string, MetadataValue> | null,
  ) => Record<string, unknown>,
  clearKeys?: string[],
): Promise<void> {
  await mutateSidecar(
    projectRoot,
    resourceId,
    async (existing) => {
      if (
        existing === null &&
        !(await exists(sidecarPathForProject(projectRoot, resourceId)))
      ) {
        throw new ResourceGoneError(resourceId);
      }
      const update = buildUpdate(existing);
      const merged: Record<string, unknown> = {
        ...(existing ?? {}),
        ...update,
        orderIndex:
          existing?.orderIndex ??
          (update.orderIndex as number | undefined) ??
          0,
        folderId:
          existing?.folderId ??
          (update.folderId as string | null | undefined) ??
          null,
      };
      if (clearKeys) {
        for (const key of clearKeys) {
          delete merged[key];
        }
      }
      return merged as Record<string, MetadataValue>;
    },
    { isReadTolerant: true },
  );
}

/**
 * Merges an incoming sidecar update with the existing sidecar, preserving
 * structural fields (`orderIndex`, `folderId`) that only the reorder route
 * may change.
 *
 * Lifted verbatim from `POST /api/resource/[resource-id]/sidecar`'s
 * `handlePost` body, plus an optional `clearKeys` parameter (FR-20/FR-25):
 * unlike `updatedResource`, whose `undefined`-valued keys are dropped by
 * `JSON.stringify` before an HTTP body ever reaches this function, `clearKeys`
 * names keys to delete from the merged sidecar explicitly, after the merge
 * and before the write. `clearKeys` is validated against a fail-closed
 * allowlist before any read-modify-write occurs.
 *
 * @throws {InvalidClearKeysCoreError} When `clearKeys` is not an array of
 *   strings, or names a key outside the allowlist. No sidecar read or write
 *   occurs in this case.
 */
export async function updateSidecarCore(
  projectId: string,
  resourceId: string,
  updatedResource: Record<string, unknown>,
  clearKeys?: string[],
): Promise<void> {
  validateClearKeys(clearKeys);
  const update = omitServerDerivedKeys(
    normalizeResourceSubtype(updatedResource),
  );

  const projectRoot = resolveResourceProjectRootOrThrow(projectId);

  await mergeSidecarUpdate(projectRoot, resourceId, () => update, clearKeys);

  // Task 14 (FR-12): un-declaring an entity (clearing `entityKind`) also
  // drops any saved entity-graph node position for it, unconditionally —
  // no checkbox, no confirmation, unlike the opt-in relationship-edge
  // removal on the same `RemoveEntityControl.tsx` flow. Hooked here, at the
  // server-side sidecar-clear core, rather than in the client-side control,
  // so every caller that clears `entityKind` through this path (the UI's
  // Remove Entity control, `EntitySection.tsx`'s direct Entity Kind clear,
  // the native in-process transport, or any future caller) gets this
  // cleanup automatically.
  if (clearKeys?.includes("entityKind")) {
    await removeEntityGraphPositionForEntity(projectRoot, resourceId);
  }
}

// ---------------------------------------------------------------------------
// 5a. Noise-term dismissal (entity-mention-noise-flagging Task 7, FR-8/FR-9/FR-13)
// ---------------------------------------------------------------------------

/**
 * Normalizes a noise-flagging term for storage and later comparison: trims
 * surrounding whitespace, then case-folds to lower case.
 *
 * This mirrors `entity-alias-warnings.ts`'s `getAliasWarning`, which compares
 * `alias.trim().toLowerCase()` against its common-word list — the schema
 * comment on `EntitySidecarFieldsSchema.dismissedNoiseTerms` (`schemas.ts`)
 * calls for the same normalization so a persisted dismissal and a later
 * noise check agree on what counts as "the same term". Exported so a later
 * noise-check implementation (or an integration pass) can reuse this exact
 * logic rather than re-deriving it and risking drift.
 */
export function normalizeNoiseTerm(term: string): string {
  return term.trim().toLowerCase();
}

/**
 * Reads a sidecar's current `dismissedNoiseTerms`, filtered down to actual
 * strings. Returns `[]` for a sidecar with no such field (including a
 * sidecar that doesn't exist yet) rather than `undefined`, so callers never
 * need to null-check it.
 */
function readDismissedNoiseTerms(
  sidecar: Record<string, MetadataValue> | null,
): string[] {
  const value = sidecar?.["dismissedNoiseTerms"];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/**
 * Sets or clears one entity resource's dismissal of a noise observation for
 * a given term (FR-8/FR-9), persisted through the existing
 * `updateSidecarCore` write path — no new API route or transport mechanism.
 *
 * This is a read-modify-write: it reads the resource's current sidecar
 * itself to find the existing `dismissedNoiseTerms` array, rather than
 * requiring the caller to supply it, so a caller only ever needs a resource
 * id and the term text (mirroring `updateSidecarCore`'s own merge-against-
 * existing-sidecar shape).
 *
 * Dismissal is keyed by the term's own normalized text (see
 * {@link normalizeNoiseTerm}), not by position or index, within this one
 * entity's own sidecar — so editing an entity's name/alias text to a
 * different string never carries over an old dismissal (FR-8): dismissing
 * `"case"` has no bearing on whether `"case2"` is later flagged, since
 * `"case2"` is never added to (or looked up in) this entity's array. The
 * same literal term dismissed on one entity still surfaces its observation
 * on a different entity using it (FR-13), since each entity's
 * `dismissedNoiseTerms` lives in that entity's own sidecar only.
 *
 * `dismissed: true` adds the normalized term if not already present
 * (idempotent — dismissing the same term twice does not duplicate it);
 * `dismissed: false` removes it if present (also idempotent). Either way,
 * the resulting array — including an empty one, when the last dismissal is
 * cleared — is merged over the stored sidecar as the new value of
 * `dismissedNoiseTerms` by `mergeSidecarUpdate`, the read-merge-write inside
 * the sidecar sink. The array is computed from the sidecar read inside the
 * sink. It does not go through `updateSidecarCore`, so that function's side
 * effects (the entity-graph position cleanup) do not run here. An empty array
 * is not `undefined`, so it survives the merge intact and no `clearKeys` entry
 * is needed.
 *
 * @returns The stored `dismissedNoiseTerms` after the change.
 * @throws {ResourceGoneError} When the resource has no sidecar.
 */
export async function setNoiseTermDismissedCore(
  projectId: string,
  resourceId: string,
  term: string,
  dismissed: boolean,
): Promise<string[]> {
  const projectRoot = resolveResourceProjectRootOrThrow(projectId);
  const normalized = normalizeNoiseTerm(term);
  let stored: string[] = [];

  await mergeSidecarUpdate(projectRoot, resourceId, (existing) => {
    const current = readDismissedNoiseTerms(existing);
    const next = dismissed
      ? current.includes(normalized)
        ? current
        : [...current, normalized]
      : current.filter((entry) => entry !== normalized);
    stored = next;
    return { dismissedNoiseTerms: next };
  });
  return stored;
}

// ---------------------------------------------------------------------------
// 6. Rename resource/folder
// ---------------------------------------------------------------------------

/**
 * Renames a folder descriptor by id.
 *
 * Lifted verbatim from `POST /api/resource/[resource-id]/rename`'s
 * `resourceType === "folder"` branch's FS call. Returns `null` when no
 * matching folder exists (the route's 404 case).
 */
export async function renameFolderCore(
  projectId: string,
  resourceId: string,
  newName: string,
): Promise<Record<string, unknown> | null> {
  const projectRoot = resolveResourceProjectRootOrThrow(projectId);
  const foldersDir = path.join(projectRoot, "folders");
  return renameFolderById(foldersDir, resourceId, newName);
}

/**
 * Soft-deletes a folder and its entire descendant subtree.
 *
 * A thin wrap — per resolved OQ-1 (Feature 26 trash-ui follow-ups, FR-3,
 * Task 3) — mirroring {@link renameFolderCore}'s own shape: resolve the
 * project root, then delegate the actual cascade (nullifying inbound
 * `resource-ref` fields, writing the FR-20 manifest, and moving every
 * descendant resource/folder into `.trash/`) to `trash.ts`'s existing
 * `softDeleteFolder`, unchanged.
 */
export async function softDeleteFolderCore(
  projectId: string,
  folderId: string,
): Promise<void> {
  const projectRoot = resolveResourceProjectRootOrThrow(projectId);
  await softDeleteFolder(projectRoot, folderId);
}

/**
 * Renames a resource by updating its sidecar's `name` field.
 *
 * Lifted verbatim from `POST /api/resource/[resource-id]/rename`'s default
 * (non-folder) branch. Returns `null` when no matching sidecar exists (the
 * route's 404 case).
 */
export async function renameResourceSidecarCore(
  projectId: string,
  resourceId: string,
  newName: string,
): Promise<Record<string, MetadataValue> | null> {
  const projectRoot = resolveResourceProjectRootOrThrow(projectId);

  const stored = await mutateSidecar(projectRoot, resourceId, (existing) =>
    existing === null ? SIDECAR_UNCHANGED : { ...existing, name: newName },
  );
  return stored;
}

// ---------------------------------------------------------------------------
// 7. Fetch resource content
// ---------------------------------------------------------------------------

/** Result shape of {@link fetchResourceContentCore}. */
export interface ResourceContentCoreResult {
  resourceContent: {
    tipTapContent: TipTapDocument | null;
    plaintextContent: string | null;
  };
  revisions: Revision[];
}

async function readTextResourceContent(
  projectPath: string,
  resourceId: string,
): Promise<{
  tipTapContent: TipTapDocument | null;
  plaintextContent: string | null;
}> {
  const resourceDir = path.join(projectPath, "resources", resourceId);

  const tiptapPath = path.join(resourceDir, "content.tiptap.json");
  let tipTapContent: TipTapDocument | null = null;
  try {
    tipTapContent = JSON.parse(
      await readFile(tiptapPath, "utf-8"),
    ) as TipTapDocument;
  } catch {
    // no tiptap file
  }

  let plaintextContent: string | null = null;
  const plaintextPath = path.join(resourceDir, "content.txt");
  try {
    plaintextContent = await readFile(plaintextPath, "utf-8");
  } catch {
    // no plaintext file
  }

  return { tipTapContent, plaintextContent };
}

/**
 * Fetches a text resource's content (tiptap + plaintext) plus its revision
 * list.
 *
 * Lifted verbatim from `POST /api/project-resources`'s `handlePost` body
 * (assumes `"text"` like the pre-lift route does — see its comment).
 *
 * @throws {Error} `No valid content found for resource ${resourceId} at path
 *   ${resourceDir}` — matches the pre-lift route's `getProjectResource`
 *   throw, mapped by the route to its existing 404 response.
 */
export async function fetchResourceContentCore(
  projectId: string,
  resourceId: string,
): Promise<ResourceContentCoreResult> {
  const projectPath = resolveResourceProjectRootOrThrow(projectId);

  const revisions = await listRevisions(projectPath, resourceId);
  const resourceContent = await readTextResourceContent(
    projectPath,
    resourceId,
  );

  return { resourceContent, revisions };
}

// ---------------------------------------------------------------------------
// 10. Reorder resources
// ---------------------------------------------------------------------------

/** One folder-order entry, as sent by `reorderResources`'s payload. */
export interface ReorderFolderEntry {
  id: string;
  orderIndex: number;
  folderId?: string | null;
}

/** One resource-order entry, as sent by `reorderResources`'s payload. */
export interface ReorderResourceEntry {
  id: string;
  orderIndex: number;
  folderId?: string | null;
}

/** Input for {@link reorderResourcesCore}. */
export interface ReorderResourcesInput {
  folderOrder: ReorderFolderEntry[];
  resourceOrder: ReorderResourceEntry[];
}

/**
 * Thrown by {@link reorderResourcesCore} when `projectId` is a well-formed
 * UUID but the resolved directory has no `project.json`.
 */
export class ReorderProjectNotFoundError extends Error {
  constructor() {
    super("project not found");
    this.name = "ReorderProjectNotFoundError";
  }
}

/**
 * Thrown by {@link reorderResourcesCore} after its sidecar loop when one or
 * more resource sidecars could not be saved. The other sidecars were saved;
 * `failedIds` names the ones that were not (note_51c813c1).
 */
export class ReorderSaveError extends Error {
  readonly failedIds: string[];
  constructor(failedIds: string[]) {
    super(`Could not save the new order for ${failedIds.length} resource(s).`);
    this.name = "ReorderSaveError";
    this.failedIds = failedIds;
  }
}

/**
 * Persists a folder/resource reorder for a project.
 *
 * Resolves the project from `projectId` (the directory basename) like every
 * other operation here. The route used to accept a client-sent `projectRoot`
 * and write under it unchecked, and otherwise matched `projectId` against
 * `project.json`'s internal `id`; both are gone.
 *
 * @throws {InvalidProjectIdCoreError} When `projectId` is not a UUID.
 * @throws {ReorderProjectNotFoundError} When no project exists at that id.
 */
export async function reorderResourcesCore(
  projectId: string,
  input: ReorderResourcesInput,
): Promise<void> {
  const { folderOrder, resourceOrder } = input;

  const projectRoot = resolveResourceProjectRootOrThrow(projectId);
  if (!(await exists(path.join(projectRoot, "project.json")))) {
    throw new ReorderProjectNotFoundError();
  }

  // Update folder descriptors (guarded by project-level meta lock)
  try {
    await withMetaLock(projectRoot, async () => {
      const foldersDir = path.join(projectRoot, "folders");
      const folderDirs = await readdir(foldersDir, {
        withFileTypes: true,
      }).catch(() => [] as Dirent[]);

      for (const fo of folderOrder) {
        for (const d of folderDirs) {
          if (!d.isDirectory()) continue;
          const folderJson = path.join(foldersDir, d.name, "folder.json");
          try {
            const parsed = JSON.parse(await readFile(folderJson, "utf8")) as {
              id?: string;
              orderIndex?: number;
              parentId?: string | null;
            };
            if (parsed && parsed.id === fo.id) {
              parsed.orderIndex = fo.orderIndex;
              parsed.parentId = fo.folderId ?? null;
              // write updated folder.json atomically
              await writeFile(
                folderJson,
                JSON.stringify(parsed, null, 2),
                "utf8",
              );
              break;
            }
          } catch (err) {
            // ignore missing files or parse errors for individual folders
            // eslint-disable-next-line no-console
            console.warn(
              "skipping folder.json update",
              folderJson,
              (err as Error).message,
            );
          }
        }
      }
    });
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    // log and continue with resources
    // eslint-disable-next-line no-console
    console.error("folder update error", err);
  }

  // Update resource sidecars. A failure no longer reports success: the rest
  // are still saved, then the call rejects naming the ones that failed. A
  // locked-access error stops at once (every later save would fail too).
  const failedIds: string[] = [];
  for (const ro of resourceOrder) {
    try {
      // The stored value is read inside the sink; an unreadable prior
      // sidecar reads as "no prior sidecar" (isReadTolerant), as before.
      await mutateSidecar(
        projectRoot,
        ro.id,
        (existing) => ({
          ...(existing ?? {}),
          orderIndex: ro.orderIndex,
          folderId: ro.folderId ?? existing?.folderId ?? null,
        }),
        { isReadTolerant: true },
      );
    } catch (err) {
      if (isLockedAccessError(err)) throw err;
      // eslint-disable-next-line no-console
      console.error("resource sidecar update failed", ro.id, err);
      failedIds.push(ro.id);
    }
  }
  if (failedIds.length > 0) throw new ReorderSaveError(failedIds);
}
