import {
  atomicWriteFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "./io";
import path from "node:path";
import {
  sidecarPathForProject,
  sidecarFilename,
  readSidecar,
  writeSidecar,
} from "./sidecar";
import { revisionsBaseDir } from "./revision";
import { removeResourceFromIndex } from "./inverted-index";
import { removeResourceFromBacklinks } from "./backlinks";
import { removeResourceFromMentionIndex } from "./mention-index";
import { getLocalResources, writeResourceToFile } from "./resource-persistence";
import { getSchema } from "./metadata-schema";
import { enqueueIndex } from "./indexer-queue";
import { removeEntityRelationshipsForEntity } from "./entity-relationships";
import {
  FolderSchema,
  TrashRefRecordSchema,
  TrashFolderManifestSchema,
  type TrashFolderManifest,
  type TrashFolderManifestEntry,
  type TrashRefRecord,
  type TrashRefRecordEntry,
} from "./schemas";
import type {
  AnyResource,
  Folder,
  MetadataValue,
  ResourceRef,
  UUID,
} from "./types";

// `TrashFolderManifest`/`TrashFolderManifestEntry` are consumed directly from
// `./schemas` by every external caller (e.g. the test suites building
// manifest fixtures) — this module only re-exports the two types that
// `core.ts`'s barrel actually names (`TrashRefRecord`/`TrashRefRecordEntry`).
export type { TrashRefRecord, TrashRefRecordEntry };

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as Record<string, unknown>)["code"] === "ENOENT"
  );
}

function trashPaths(projectRoot: string) {
  const trashRoot = path.join(projectRoot, ".trash");
  return {
    trashRoot,
    trashResourcesDir: path.join(trashRoot, "resources"),
    trashMetaDir: path.join(trashRoot, "meta"),
    trashRevisionsDir: path.join(trashRoot, "revisions"),
    trashFoldersDir: path.join(trashRoot, "folders"),
  };
}

/**
 * Returns the trash-side directory holding all revisions for a resource,
 * mirroring `revision.ts`'s `revisionsBaseDir` layout under `.trash/`.
 */
function trashRevisionsBaseDir(projectRoot: string, resourceId: UUID): string {
  return path.join(trashPaths(projectRoot).trashRevisionsDir, resourceId);
}

/**
 * Shape of a single cleared-value observation `patchRef` reports back, prior
 * to the `referencingResourceId` being known to it (the caller, iterating
 * sidecars, attaches that). `arrayIndex` is present only when the cleared
 * value lived inside a multi-valued (array) `resource-ref` field, mirroring
 * `TrashRefRecordEntrySchema`'s own omitted-not-undefined convention.
 */
type PatchRefEntry = Omit<TrashRefRecordEntry, "referencingResourceId">;

/**
 * Recursively patches a value: if it is a ResourceRef object whose `id`
 * matches `deletedId`, replaces `id` with `null`. Handles arrays of
 * ResourceRef objects (resource-ref fields with `multiple: true`).
 * Works in `unknown` space so callers need not narrow the value first.
 *
 * Also reports, via `entries`, every cleared value it found — each shaped
 * per Task 1's `TrashRefRecordEntrySchema` (minus `referencingResourceId`,
 * which the sidecar-iterating caller attaches) — so `nullifyResourceRefs`
 * can persist the FR-8 ref record alongside performing the patch.
 */
function patchRef(
  raw: unknown,
  deletedId: UUID,
  fieldKey: string,
  arrayIndex?: number,
): { changed: boolean; value: unknown; entries: PatchRefEntry[] } {
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (obj["id"] === deletedId && typeof obj["name"] === "string") {
      const priorValue = { id: obj["id"] as string, name: obj["name"] };
      const entry: PatchRefEntry =
        arrayIndex !== undefined
          ? { fieldKey, arrayIndex, priorValue }
          : { fieldKey, priorValue };
      return {
        changed: true,
        value: { id: null, name: obj["name"] },
        entries: [entry],
      };
    }
    return { changed: false, value: raw, entries: [] };
  }

  if (Array.isArray(raw)) {
    let isAnyChanged = false;
    const entries: PatchRefEntry[] = [];
    const patched = raw.map((el: unknown, idx: number) => {
      const r = patchRef(el, deletedId, fieldKey, idx);
      if (r.changed) {
        isAnyChanged = true;
        entries.push(...r.entries);
      }
      return r.value;
    });
    return isAnyChanged
      ? { changed: true, value: patched, entries }
      : { changed: false, value: raw, entries: [] };
  }

  return { changed: false, value: raw, entries: [] };
}

/**
 * Scans all sidecar files in `<projectRoot>/meta/` and nullifies any
 * `ResourceRef` values in `userMetadata` that reference `deletedResourceId`.
 *
 * A matching value `{ id: deletedResourceId, name: X }` is replaced with
 * `{ id: null, name: X }`. Arrays of ResourceRef objects (resource-ref fields
 * with `multiple: true`) are patched element-by-element.
 *
 * The deleted resource's own sidecar is skipped — it will be moved to trash
 * by `softDeleteResource` immediately after this call.
 *
 * Uses `writeSidecar` for each patched file, which serialises concurrent writes
 * via the meta-lock.
 *
 * Returns every entry it cleared, each shaped per Task 1's
 * `TrashRefRecordEntrySchema` (FR-8) — the raw material a caller persists via
 * {@link writeTrashRefRecord} so a later restore can re-link these fields.
 */
export async function nullifyResourceRefs(
  projectRoot: string,
  deletedResourceId: UUID,
  deletedResourceName: string,
  resourceRefFieldKeys: string[],
): Promise<TrashRefRecordEntry[]> {
  if (resourceRefFieldKeys.length === 0) return [];

  const metaDir = path.join(projectRoot, "meta");
  let entries: string[];
  try {
    entries = await readdir(metaDir);
  } catch (err: unknown) {
    if (isEnoent(err)) return [];
    throw err;
  }

  const sidecarEntries = entries.filter(
    (e) =>
      e.startsWith("resource-") &&
      e.endsWith(".meta.json") &&
      !e.includes(deletedResourceId),
  );

  const clearedEntries: TrashRefRecordEntry[] = [];

  for (const entry of sidecarEntries) {
    const resourceId = entry
      .replace(/^resource-/, "")
      .replace(/\.meta\.json$/, "");

    const sidecar = await readSidecar(projectRoot, resourceId);
    if (!sidecar) continue;

    const rawMeta = sidecar["userMetadata"];
    if (
      typeof rawMeta !== "object" ||
      rawMeta === null ||
      Array.isArray(rawMeta)
    ) {
      continue;
    }

    const userMetadata = rawMeta as Record<string, MetadataValue>;
    let isDirty = false;

    for (const fieldKey of resourceRefFieldKeys) {
      const value = userMetadata[fieldKey];
      if (value === undefined) continue;

      const result = patchRef(value, deletedResourceId, fieldKey);
      if (result.changed) {
        userMetadata[fieldKey] = result.value as MetadataValue;
        isDirty = true;
        for (const patchEntry of result.entries) {
          clearedEntries.push({
            referencingResourceId: resourceId,
            ...patchEntry,
          });
        }
      }
    }

    if (isDirty) {
      sidecar["userMetadata"] = userMetadata;
      await writeSidecar(projectRoot, resourceId, sidecar);
    }
  }

  return clearedEntries;
}

/**
 * Compute the trash-side path for a resource's FR-8 nullified-reference
 * record: `.trash/meta/refs-<resourceId>.json`.
 */
function trashRefRecordPath(projectRoot: string, resourceId: UUID): string {
  return path.join(
    trashPaths(projectRoot).trashMetaDir,
    `refs-${resourceId}.json`,
  );
}

/**
 * Persist the FR-8 nullified-reference record for a just-trashed resource:
 * every referencing sidecar field {@link nullifyResourceRefs} cleared, so a
 * later restore can re-link fields still in their cleared state.
 *
 * Validates the record against Task 1's `TrashRefRecordSchema` before
 * writing. Writes via `io.ts` (not `node:fs`), matching every other
 * filesystem access in this module.
 */
export async function writeTrashRefRecord(
  projectRoot: string,
  resourceId: UUID,
  entries: TrashRefRecordEntry[],
): Promise<void> {
  const record: TrashRefRecord = TrashRefRecordSchema.parse({
    resourceId,
    entries,
  });

  const { trashMetaDir } = trashPaths(projectRoot);
  await mkdir(trashMetaDir, { recursive: true });
  await atomicWriteFile(
    trashRefRecordPath(projectRoot, resourceId),
    JSON.stringify(record, null, 2),
    "utf8",
  );
}

/**
 * Read a resource's FR-8 nullified-reference record from
 * `.trash/meta/refs-<resourceId>.json`.
 *
 * Returns `undefined` — not a thrown error — when no ref record file exists:
 * this is the ordinary, expected case for any resource trashed before this
 * feature existed (resolved OQ-12, "legacy tolerance"), not an error
 * condition.
 */
export async function readTrashRefRecord(
  projectRoot: string,
  resourceId: UUID,
): Promise<TrashRefRecord | undefined> {
  try {
    const raw = await readFile(
      trashRefRecordPath(projectRoot, resourceId),
      "utf8",
    );
    return TrashRefRecordSchema.parse(JSON.parse(raw));
  } catch (err: unknown) {
    if (isEnoent(err)) return undefined;
    throw err;
  }
}

/**
 * Move resource files and sidecar to the project's `.trash/` area.
 * Preserves identities and returns the trash path root used for the resource.
 */
export async function softDeleteResource(
  projectRoot: string,
  resourceId: UUID,
): Promise<string> {
  const { trashRoot, trashResourcesDir, trashMetaDir } =
    trashPaths(projectRoot);

  await mkdir(trashResourcesDir, { recursive: true });
  await mkdir(trashMetaDir, { recursive: true });

  // Remove the resource from the inverted index, backlinks, and mention
  // index immediately (FR-16/FR-17, resolved OQ-7) — not deferred to purge.
  await removeResourceFromIndex(projectRoot, resourceId);
  await removeResourceFromBacklinks(projectRoot, resourceId);
  await removeResourceFromMentionIndex(projectRoot, resourceId);

  // Move sidecar if present
  const sidecarSrc = sidecarPathForProject(projectRoot, resourceId);
  const sidecarName = sidecarFilename(resourceId);
  const sidecarDest = path.join(trashMetaDir, sidecarName);
  try {
    await rename(sidecarSrc, sidecarDest);
  } catch (err: unknown) {
    // If file does not exist, ignore; otherwise rethrow
    if (!isEnoent(err)) throw err;
  }

  // Move any resource files matching the resourceId under `resources/`.
  const resourcesDir = path.join(projectRoot, "resources");
  try {
    const entries = await readdir(resourcesDir);
    for (const e of entries) {
      if (e.includes(resourceId)) {
        const src = path.join(resourcesDir, e);
        const dest = path.join(trashResourcesDir, `${resourceId}-${e}`);
        await rename(src, dest);
      }
    }
  } catch (err: unknown) {
    // resources directory missing: ignore
    if (!isEnoent(err)) throw err;
  }

  // Move revisions, if any, to `.trash/revisions/<resourceId>/`.
  const revisionsSrc = revisionsBaseDir(projectRoot, resourceId);
  try {
    await stat(revisionsSrc);
  } catch (err: unknown) {
    if (!isEnoent(err)) throw err;
    return trashRoot;
  }

  const revisionsDest = trashRevisionsBaseDir(projectRoot, resourceId);
  await mkdir(path.dirname(revisionsDest), { recursive: true });
  await rename(revisionsSrc, revisionsDest);

  return trashRoot;
}

/**
 * Compute the trash-side path for a trashed folder's FR-20 manifest:
 * `.trash/meta/folder-<folderId>.json`.
 */
function trashFolderManifestPath(projectRoot: string, folderId: UUID): string {
  return path.join(
    trashPaths(projectRoot).trashMetaDir,
    `folder-${folderId}.json`,
  );
}

/** One folder descriptor found under `folders/`, alongside the directory it lives in. */
interface FolderDescriptorEntry {
  folder: Folder;
  dirPath: string;
}

/**
 * Recursively reads every folder descriptor under `foldersDir`, pairing each
 * one with the on-disk directory it was read from (needed to move that exact
 * directory into `.trash/folders/` later — `folders/` is flat, keyed by slug,
 * with hierarchy expressed only through each folder's own `parentId`, so a
 * folder's directory name cannot always be re-derived from its `slug` alone
 * once a slug-collision suffix is involved).
 *
 * A missing/unparsable `folder.json` is skipped (not thrown), mirroring
 * `folder-utils.ts`'s `readFolderTree` tolerance for orphan directories.
 */
async function collectFolderDescriptors(
  foldersDir: string,
): Promise<FolderDescriptorEntry[]> {
  const result: FolderDescriptorEntry[] = [];

  let names: string[];
  try {
    names = (await readdir(foldersDir)).filter((n) => n !== ".DS_Store");
  } catch (err: unknown) {
    if (isEnoent(err)) return result;
    throw err;
  }

  for (const name of names) {
    const subDir = path.join(foldersDir, name);
    let isDir = false;
    try {
      isDir = (await stat(subDir)).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;

    try {
      const raw = await readFile(path.join(subDir, "folder.json"), "utf8");
      const folder = FolderSchema.parse(JSON.parse(raw)) as Folder;
      result.push({ folder, dirPath: subDir });
    } catch {
      // no folder.json, or it failed validation — skip descriptor, still recurse
    }

    result.push(...(await collectFolderDescriptors(subDir)));
  }

  return result;
}

/**
 * Soft-deletes a folder and every descendant folder/resource beneath it
 * (FR-3, FR-20): a plain resource delete never touches `folders/`, so a
 * folder delete needs its own cascade to avoid orphaning children.
 *
 * Before moving anything, walks the full `folders/` tree plus every resource
 * sidecar to compute the complete descendant set from `parentId`/`folderId`
 * links, and writes that set — the target folder's own descriptor plus every
 * descendant id with its original `parentId` and `orderIndex` — to
 * `.trash/meta/folder-<folderId>.json` (Task 2's `TrashFolderManifestSchema`)
 * so a later restore can rebuild the tree.
 *
 * Each descendant resource is then soft-deleted via the same per-resource
 * sequence a plain delete uses: nullify inbound `resource-ref` fields,
 * persist the resulting FR-8 ref record, then {@link softDeleteResource}
 * (which itself moves content/sidecar/revisions and removes the resource
 * from the index/backlinks/mention index). Every descendant folder's own
 * `folder.json` is then moved into `.trash/folders/`, preserving its
 * existing directory name (not recomputed from slug, for the same
 * collision-suffix reason `collectFolderDescriptors` keeps `dirPath`).
 * Finally the target folder's own descriptor is moved the same way.
 *
 * Throws if no folder with `folderId` exists under `folders/`.
 */
export async function softDeleteFolder(
  projectRoot: string,
  folderId: UUID,
): Promise<string> {
  const { trashRoot, trashMetaDir, trashFoldersDir } = trashPaths(projectRoot);
  const foldersRoot = path.join(projectRoot, "folders");

  const allFolders = await collectFolderDescriptors(foldersRoot);
  const target = allFolders.find((f) => f.folder.id === folderId);
  if (!target) {
    throw new Error(`Folder not found: ${folderId}`);
  }

  const allResources = await getLocalResources(projectRoot);

  const folderChildren = new Map<string, FolderDescriptorEntry[]>();
  for (const fd of allFolders) {
    const key = fd.folder.parentId ?? "";
    const list = folderChildren.get(key) ?? [];
    list.push(fd);
    folderChildren.set(key, list);
  }

  const resourceChildren = new Map<string, AnyResource[]>();
  for (const r of allResources) {
    const key = r.folderId ?? "";
    const list = resourceChildren.get(key) ?? [];
    list.push(r);
    resourceChildren.set(key, list);
  }

  function collectDescendants(id: string): TrashFolderManifestEntry[] {
    const entries: TrashFolderManifestEntry[] = [];
    for (const cf of folderChildren.get(id) ?? []) {
      entries.push({
        id: cf.folder.id,
        kind: "folder",
        parentId: cf.folder.parentId ?? null,
        orderIndex: cf.folder.orderIndex,
      });
      entries.push(...collectDescendants(cf.folder.id));
    }
    for (const cr of resourceChildren.get(id) ?? []) {
      entries.push({
        id: cr.id,
        kind: "resource",
        parentId: cr.folderId ?? null,
        orderIndex: cr.orderIndex,
      });
    }
    return entries;
  }

  const descendants = collectDescendants(folderId);

  // Write the manifest before moving anything, so an interrupted cascade
  // still leaves a record of what was intended (mirrors the ref record being
  // persisted before the resource files it describes are moved).
  const manifest: TrashFolderManifest = TrashFolderManifestSchema.parse({
    folder: target.folder,
    descendants,
  });
  await mkdir(trashMetaDir, { recursive: true });
  await atomicWriteFile(
    trashFolderManifestPath(projectRoot, folderId),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  // Soft-delete every descendant resource, reusing the same nullify +
  // ref-record + softDeleteResource sequence a plain resource delete uses
  // (resource-crud-core.ts's deleteResourceCore) rather than duplicating it.
  let resourceRefKeys: string[] = [];
  try {
    const schema = await getSchema(projectRoot);
    resourceRefKeys = schema.groups
      .flatMap((g) => g.fields)
      .filter(
        (f) => f.type === "resource-ref" || f.type === "multi-resource-ref",
      )
      .map((f) => f.key);
  } catch {
    // Schema unreadable — proceed without nullification
  }

  const resourceById = new Map(allResources.map((r) => [r.id, r]));

  for (const entry of descendants) {
    if (entry.kind !== "resource") continue;
    const resource = resourceById.get(entry.id);
    const deletedName = resource?.name ?? "";
    const clearedEntries = await nullifyResourceRefs(
      projectRoot,
      entry.id,
      deletedName,
      resourceRefKeys,
    );
    await writeTrashRefRecord(projectRoot, entry.id, clearedEntries);
    await softDeleteResource(projectRoot, entry.id);
  }

  // Move every descendant folder's own descriptor into `.trash/folders/`,
  // preserving its existing directory name.
  const folderById = new Map(allFolders.map((fd) => [fd.folder.id, fd]));
  for (const entry of descendants) {
    if (entry.kind !== "folder") continue;
    const fd = folderById.get(entry.id);
    if (!fd) continue;
    const dest = path.join(trashFoldersDir, path.basename(fd.dirPath));
    await mkdir(trashFoldersDir, { recursive: true });
    await rename(fd.dirPath, dest);
  }

  // Finally, move the target folder's own descriptor.
  const targetDest = path.join(trashFoldersDir, path.basename(target.dirPath));
  await mkdir(trashFoldersDir, { recursive: true });
  await rename(target.dirPath, targetDest);

  return trashRoot;
}

/**
 * One reference-relinking outcome, corresponding to a single Task 4 ref
 * record entry: which referencing resource/field it names.
 */
export interface RestoredReferenceInfo {
  referencingResourceId: UUID;
  fieldKey: string;
  arrayIndex?: number;
}

/**
 * Structured result of {@link restoreResource} (FR-5/FR-9/FR-16/FR-22),
 * letting a caller distinguish a plain restore from one that had to relocate
 * the resource, rename it, or leave some references un-relinked.
 */
export interface RestoreResourceResult {
  /** Name the resource is restored under (after any collision suffix). */
  restoredName: string;
  /** True when the resource's original parent folder no longer exists and it landed at the project root instead (resolved OQ-2's fallback). */
  relocated: boolean;
  /** True when `restoredName` differs from the resource's original name because of a collision at the destination. */
  renamed: boolean;
  /** Every ref-record entry successfully re-linked back to this resource. */
  referencesRestored: RestoredReferenceInfo[];
  /**
   * Every ref-record entry left untouched — either because the referencing
   * field's value changed since deletion (no longer in its cleared
   * `{ id: null, name }` state), or `"no-record"` when the resource has no
   * Task 4 ref record at all (a legacy item soft-deleted before FR-8 existed,
   * resolved OQ-12).
   */
  referencesNotRestored: RestoredReferenceInfo[] | "no-record";
}

function toReferenceInfo(entry: TrashRefRecordEntry): RestoredReferenceInfo {
  return entry.arrayIndex !== undefined
    ? {
        referencingResourceId: entry.referencingResourceId,
        fieldKey: entry.fieldKey,
        arrayIndex: entry.arrayIndex,
      }
    : {
        referencingResourceId: entry.referencingResourceId,
        fieldKey: entry.fieldKey,
      };
}

/**
 * True when `value` is still the exact cleared marker `nullifyResourceRefs`
 * left behind for a reference named `name` — i.e. it has not been repointed
 * to a different resource (or otherwise edited) since the delete that
 * cleared it.
 */
function isStillClearedRef(value: unknown, name: string): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>)["id"] === null &&
    (value as Record<string, unknown>)["name"] === name
  );
}

/**
 * Re-links every entry in a Task 4 ref record that is still in its cleared
 * `{ id: null, name }` state back to the just-restored resource (FR-9). An
 * entry whose referencing field changed since the delete — repointed to a
 * different resource, cleared field removed entirely, or the referencing
 * resource itself gone — is left untouched and reported instead of being
 * overwritten.
 *
 * Groups entries by `referencingResourceId` so each referencing sidecar is
 * read-modified-written once, mirroring `nullifyResourceRefs`'s own grouping.
 */
async function relinkResourceRefs(
  projectRoot: string,
  resourceId: UUID,
  record: TrashRefRecord,
): Promise<{
  restored: RestoredReferenceInfo[];
  notRestored: RestoredReferenceInfo[];
}> {
  const restored: RestoredReferenceInfo[] = [];
  const notRestored: RestoredReferenceInfo[] = [];

  const byReferencingResource = new Map<UUID, TrashRefRecordEntry[]>();
  for (const entry of record.entries) {
    const list = byReferencingResource.get(entry.referencingResourceId) ?? [];
    list.push(entry);
    byReferencingResource.set(entry.referencingResourceId, list);
  }

  for (const [referencingResourceId, entries] of byReferencingResource) {
    const sidecar = await readSidecar(projectRoot, referencingResourceId);
    const rawMeta = sidecar?.["userMetadata"];
    const userMetadata =
      sidecar &&
      typeof rawMeta === "object" &&
      rawMeta !== null &&
      !Array.isArray(rawMeta)
        ? (rawMeta as Record<string, MetadataValue>)
        : undefined;

    let isDirty = false;

    for (const entry of entries) {
      const info = toReferenceInfo(entry);
      const value = userMetadata?.[entry.fieldKey];

      if (entry.arrayIndex !== undefined) {
        if (
          Array.isArray(value) &&
          isStillClearedRef(value[entry.arrayIndex], entry.priorValue.name)
        ) {
          const nextArray = (value as unknown as ResourceRef[]).slice();
          nextArray[entry.arrayIndex] = {
            id: resourceId,
            name: entry.priorValue.name,
          };
          userMetadata![entry.fieldKey] = nextArray as MetadataValue;
          isDirty = true;
          restored.push(info);
        } else {
          notRestored.push(info);
        }
        continue;
      }

      if (isStillClearedRef(value, entry.priorValue.name)) {
        userMetadata![entry.fieldKey] = {
          id: resourceId,
          name: entry.priorValue.name,
        } as MetadataValue;
        isDirty = true;
        restored.push(info);
      } else {
        notRestored.push(info);
      }
    }

    if (isDirty && sidecar && userMetadata) {
      sidecar["userMetadata"] = userMetadata as MetadataValue;
      await writeSidecar(projectRoot, referencingResourceId, sidecar);
    }
  }

  return { restored, notRestored };
}

/**
 * Whether a folder with id `folderId` still exists under `folders/` (i.e.
 * has not itself been soft-deleted or otherwise removed).
 */
async function folderExists(
  projectRoot: string,
  folderId: UUID,
): Promise<boolean> {
  const foldersRoot = path.join(projectRoot, "folders");
  const descriptors = await collectFolderDescriptors(foldersRoot);
  return descriptors.some((d) => d.folder.id === folderId);
}

/**
 * Resolves a free name for the restored resource at `destinationFolderId`,
 * applying resolved OQ-2's suffix rule on a collision with a sibling
 * resource already at that destination: `"<name> (restored)"`, then
 * `"<name> (restored 2)"`, `"<name> (restored 3)"`, ... until free.
 */
async function resolveRestoreName(
  projectRoot: string,
  destinationFolderId: UUID | null,
  originalName: string,
): Promise<{ name: string; renamed: boolean }> {
  const siblings = await getLocalResources(projectRoot);
  const siblingNames = new Set(
    siblings
      .filter((r) => (r.folderId ?? null) === destinationFolderId)
      .map((r) => r.name),
  );

  if (!siblingNames.has(originalName)) {
    return { name: originalName, renamed: false };
  }

  let n = 1;
  for (;;) {
    const candidate =
      n === 1
        ? `${originalName} (restored)`
        : `${originalName} (restored ${n})`;
    if (!siblingNames.has(candidate)) {
      return { name: candidate, renamed: true };
    }
    n += 1;
  }
}

/**
 * Restore resource and sidecar from `.trash/` back to their original
 * location, applying the FR-5/FR-9/FR-22 rules for a parent folder that no
 * longer exists (falls back to the project root) and a name collision at the
 * destination (resolved OQ-2's `" (restored)"`/`" (restored N)"` suffix).
 *
 * Re-indexes the restored resource through `indexer-queue.ts`'s
 * `enqueueIndex` (FR-16 — inverted index, then backlinks, then mentions, in
 * that order inside one task), and re-links every reference still in its
 * Task 4 cleared `{ id: null, name }` state back to the restored resource
 * (FR-9), leaving alone — and reporting — any reference that changed since
 * deletion. A legacy item with no ref record at all (resolved OQ-12) gets no
 * re-linking, reported as `referencesNotRestored: "no-record"`.
 *
 * If multiple resource filenames exist in the trash, restores the first
 * match for each.
 */
export async function restoreResource(
  projectRoot: string,
  resourceId: UUID,
): Promise<RestoreResourceResult> {
  const { trashResourcesDir, trashMetaDir } = trashPaths(projectRoot);

  // Read the trashed sidecar (if any) so we can resolve destination folder
  // and name before writing it back — its path doesn't encode either, so
  // this is safe to do ahead of any file move.
  const sidecarName = sidecarFilename(resourceId);
  const sidecarSrc = path.join(trashMetaDir, sidecarName);
  const sidecarDest = sidecarPathForProject(projectRoot, resourceId);

  let trashedSidecar: Record<string, MetadataValue> | null = null;
  try {
    trashedSidecar = JSON.parse(await readFile(sidecarSrc, "utf8")) as Record<
      string,
      MetadataValue
    >;
  } catch (err: unknown) {
    if (!isEnoent(err)) throw err;
  }

  let isRelocated = false;
  let isRenamed = false;
  let restoredName = "";

  if (trashedSidecar) {
    const originalFolderId =
      typeof trashedSidecar["folderId"] === "string"
        ? (trashedSidecar["folderId"] as string)
        : null;
    const originalName =
      typeof trashedSidecar["name"] === "string"
        ? (trashedSidecar["name"] as string)
        : resourceId;

    let destinationFolderId: UUID | null = originalFolderId;
    if (originalFolderId !== null) {
      const isFolderStillPresent = await folderExists(
        projectRoot,
        originalFolderId,
      );
      if (!isFolderStillPresent) {
        destinationFolderId = null;
        isRelocated = true;
      }
    }

    const resolvedName = await resolveRestoreName(
      projectRoot,
      destinationFolderId,
      originalName,
    );
    restoredName = resolvedName.name;
    isRenamed = resolvedName.renamed;

    const updatedSidecar: Record<string, MetadataValue> = {
      ...trashedSidecar,
      name: restoredName,
      folderId: destinationFolderId,
    };

    await mkdir(path.dirname(sidecarDest), { recursive: true });
    await atomicWriteFile(
      sidecarDest,
      JSON.stringify(updatedSidecar, null, 2),
      "utf8",
    );
    await rm(sidecarSrc, { force: true });
  }

  // Restore resource files
  const resourcesDir = path.join(projectRoot, "resources");
  try {
    const entries = await readdir(trashResourcesDir);
    for (const e of entries) {
      if (e.startsWith(resourceId + "-")) {
        const src = path.join(trashResourcesDir, e);
        const originalName = e.replace(`${resourceId}-`, "");
        await mkdir(resourcesDir, { recursive: true });
        const dest = path.join(resourcesDir, originalName);
        await rename(src, dest);
        // restore only one file per matching entry
      }
    }
  } catch (err: unknown) {
    // nothing to restore
    if (!isEnoent(err)) throw err;
  }

  // Restore revisions, if any, from `.trash/revisions/<resourceId>/`.
  const trashedRevisionsDir = trashRevisionsBaseDir(projectRoot, resourceId);
  try {
    await stat(trashedRevisionsDir);
    const revisionsDest = revisionsBaseDir(projectRoot, resourceId);
    await mkdir(path.dirname(revisionsDest), { recursive: true });
    await rename(trashedRevisionsDir, revisionsDest);
  } catch (err: unknown) {
    if (!isEnoent(err)) throw err;
  }

  // Re-index the restored resource (FR-16): inverted index, then backlinks,
  // then mentions, all inside one `enqueueIndex` task.
  await enqueueIndex(projectRoot, resourceId);

  // Re-link references still in their Task 4 cleared state (FR-9), or report
  // the legacy "no ref record at all" case (resolved OQ-12).
  const record = await readTrashRefRecord(projectRoot, resourceId);
  let referencesRestored: RestoredReferenceInfo[] = [];
  let referencesNotRestored: RestoredReferenceInfo[] | "no-record" =
    "no-record";
  if (record) {
    const relinked = await relinkResourceRefs(projectRoot, resourceId, record);
    referencesRestored = relinked.restored;
    referencesNotRestored = relinked.notRestored;
  }

  return {
    restoredName,
    relocated: isRelocated,
    renamed: isRenamed,
    referencesRestored,
    referencesNotRestored,
  };
}

/**
 * Resolves a free name for the restored folder at `destinationParentId`,
 * applying the same resolved OQ-2 suffix rule {@link resolveRestoreName}
 * applies to a restored resource: `"<name> (restored)"`, then
 * `"<name> (restored 2)"`, ... until free among sibling folders already
 * living at that parent.
 */
async function resolveRestoreFolderName(
  projectRoot: string,
  destinationParentId: UUID | null,
  originalName: string,
): Promise<{ name: string; renamed: boolean }> {
  const foldersRoot = path.join(projectRoot, "folders");
  const siblings = await collectFolderDescriptors(foldersRoot);
  const siblingNames = new Set(
    siblings
      .filter((fd) => (fd.folder.parentId ?? null) === destinationParentId)
      .map((fd) => fd.folder.name),
  );

  if (!siblingNames.has(originalName)) {
    return { name: originalName, renamed: false };
  }

  let n = 1;
  for (;;) {
    const candidate =
      n === 1
        ? `${originalName} (restored)`
        : `${originalName} (restored ${n})`;
    if (!siblingNames.has(candidate)) {
      return { name: candidate, renamed: true };
    }
    n += 1;
  }
}

/**
 * Structured result of {@link restoreFolder} (FR-5/FR-20), mirroring
 * {@link RestoreResourceResult}'s `relocated`/`renamed` reporting for the
 * top-level folder itself.
 */
export interface RestoreFolderResult {
  /** Name the top-level folder is restored under (after any collision suffix). */
  restoredName: string;
  /** True when the folder's original parent folder no longer exists and it landed at the project root instead. */
  relocated: boolean;
  /** True when `restoredName` differs from the folder's original name because of a collision at the destination. */
  renamed: boolean;
  /** Every descendant resource id restored (via {@link restoreResource}) as part of this cascade. */
  restoredDescendantResourceIds: UUID[];
  /** Every descendant folder id restored as part of this cascade. */
  restoredDescendantFolderIds: UUID[];
}

/**
 * Restores a trashed folder and its whole descendant tree from Task 6's
 * manifest (`.trash/meta/folder-<folderId>.json`), rebuilding it at each
 * descendant's originally recorded `parentId`/`orderIndex` (FR-5/FR-20).
 *
 * The top-level folder itself gets the same FR-5 treatment a restored
 * resource gets ({@link restoreResource}): if its original parent folder no
 * longer exists, it falls back to the project root (`relocated: true`); if
 * its name collides with a sibling already at the destination, it is
 * suffixed `" (restored)"`, `" (restored 2)"`, ... (`renamed: true`).
 *
 * Every descendant folder is restored verbatim at its manifest-recorded
 * `parentId`/`orderIndex` — no relocation or rename logic is applied to a
 * descendant folder, only to the top-level one — and every descendant
 * resource is restored via {@link restoreResource}, reusing its own
 * root-fallback/collision-suffix/re-linking/re-indexing behavior. The
 * manifest's own entry order is a pre-order walk (a folder always precedes
 * its own descendants), so processing it in order guarantees every
 * descendant folder's parent already exists in the live tree by the time it
 * is restored.
 *
 * Throws if no Task 6 manifest exists for `folderId`.
 */
export async function restoreFolder(
  projectRoot: string,
  folderId: UUID,
): Promise<RestoreFolderResult> {
  const { trashFoldersDir } = trashPaths(projectRoot);

  let manifest: TrashFolderManifest;
  try {
    const raw = await readFile(
      trashFolderManifestPath(projectRoot, folderId),
      "utf8",
    );
    manifest = TrashFolderManifestSchema.parse(JSON.parse(raw));
  } catch (err: unknown) {
    if (isEnoent(err)) {
      throw new Error(`No trash manifest found for folder: ${folderId}`);
    }
    throw err;
  }

  const trashedDescriptors = await collectFolderDescriptors(trashFoldersDir);
  const trashedByFolderId = new Map(
    trashedDescriptors.map((fd) => [fd.folder.id, fd]),
  );

  // Restore the top-level folder's own descriptor, applying the same
  // root-fallback and collision-suffix rules Task 8 applies to a restored
  // resource.
  const originalParentId = manifest.folder.parentId ?? null;
  let destinationParentId: UUID | null = originalParentId;
  let isRelocated = false;
  if (originalParentId !== null) {
    const isParentStillPresent = await folderExists(
      projectRoot,
      originalParentId,
    );
    if (!isParentStillPresent) {
      destinationParentId = null;
      isRelocated = true;
    }
  }

  const resolvedName = await resolveRestoreFolderName(
    projectRoot,
    destinationParentId,
    manifest.folder.name,
  );

  const restoredTopFolder: Folder = {
    ...manifest.folder,
    parentId: destinationParentId,
    name: resolvedName.name,
  };
  await writeResourceToFile(projectRoot, restoredTopFolder);

  const topTrashedDir = trashedByFolderId.get(folderId)?.dirPath;
  if (topTrashedDir) {
    await rm(topTrashedDir, { recursive: true, force: true });
  }

  // Restore every descendant, in manifest order (a pre-order walk — a
  // folder's own entry always precedes its descendants' entries), so each
  // descendant folder's parent already exists by the time it is processed.
  const restoredDescendantResourceIds: UUID[] = [];
  const restoredDescendantFolderIds: UUID[] = [];

  for (const entry of manifest.descendants) {
    if (entry.kind === "folder") {
      const descriptor = trashedByFolderId.get(entry.id);
      if (!descriptor) continue;
      await writeResourceToFile(projectRoot, descriptor.folder);
      await rm(descriptor.dirPath, { recursive: true, force: true });
      restoredDescendantFolderIds.push(entry.id);
    } else {
      await restoreResource(projectRoot, entry.id);
      restoredDescendantResourceIds.push(entry.id);
    }
  }

  await rm(trashFolderManifestPath(projectRoot, folderId), { force: true });

  return {
    restoredName: resolvedName.name,
    relocated: isRelocated,
    renamed: resolvedName.renamed,
    restoredDescendantResourceIds,
    restoredDescendantFolderIds,
  };
}

/**
 * Permanently removes a resource's trashed revisions (FR-6/FR-18 step 3 of
 * the ordered purge sweep).
 *
 * Prefers the current-layout path `.trash/revisions/<resourceId>/` (where
 * {@link softDeleteResource} moves revisions as of Task 3). When that path is
 * absent, falls back to the legacy path `revisions/<resourceId>/` directly
 * under the project root (resolved OQ-12): a resource soft-deleted before
 * Task 3 existed never had its revisions moved into `.trash/` at all, so a
 * later purge must still find and delete them from where they were left.
 *
 * Idempotent: removing an already-absent directory at either path is a
 * silent no-op (`rm`'s `force: true`), matching the idempotency FR-6/FR-18
 * require of every purge-sweep step.
 */
export async function purgeTrashedRevisions(
  projectRoot: string,
  resourceId: UUID,
): Promise<void> {
  const trashedRevisionsDir = trashRevisionsBaseDir(projectRoot, resourceId);
  if (await pathExists(trashedRevisionsDir)) {
    await rm(trashedRevisionsDir, { recursive: true, force: true });
    return;
  }

  const legacyRevisionsDir = revisionsBaseDir(projectRoot, resourceId);
  await rm(legacyRevisionsDir, { recursive: true, force: true });
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch (err: unknown) {
    if (isEnoent(err)) return false;
    throw err;
  }
}

/**
 * Identifies which of the five FR-18 ordered purge-sweep steps a
 * {@link PurgeSweepError} failed at, in sweep order:
 *
 * 1. `"index-backlinks-mentions"` — inverted index, backlinks, mention index.
 * 2. `"relationships"` — authored entity relationship edges.
 * 3. `"revisions"` — trashed revisions.
 * 4. `"sidecar-and-ref-record"` — trashed sidecar and FR-8 ref record (or,
 *    for a folder purge, that resource's own step — the manifest/folder
 *    descriptor removal is a separate, later step of {@link purgeFolder}
 *    itself, not this per-resource enum).
 * 5. `"content-files"` — trashed resource content files, last.
 */
export type PurgeStepName =
  | "index-backlinks-mentions"
  | "relationships"
  | "revisions"
  | "sidecar-and-ref-record"
  | "content-files"
  | "folder-manifest-and-descriptor";

/**
 * Structured error thrown by {@link purgeResource}/{@link purgeFolder} when a
 * purge-sweep step fails (FR-18). Names the step that failed and the item
 * being purged, and carries the original error as `cause`, so a caller (the
 * Task 11 API route) can surface exactly where the sweep stopped rather than
 * a generic failure. The item remains listed in Trash; re-running purge on it
 * completes only the remaining steps, since every step is independently
 * idempotent.
 */
export class PurgeSweepError extends Error {
  readonly step: PurgeStepName;
  readonly itemId: UUID;

  constructor(step: PurgeStepName, itemId: UUID, cause: unknown) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    super(
      `Purge sweep failed at step "${step}" for ${itemId}: ${causeMessage}`,
      { cause },
    );
    this.name = "PurgeSweepError";
    this.step = step;
    this.itemId = itemId;
  }
}

/**
 * The five FR-18 ordered purge-sweep steps for a single resource, each
 * exported on this object (rather than called as bare module-local
 * functions) so a test can substitute one via `vi.spyOn` / direct property
 * assignment to simulate a mid-sweep failure — {@link purgeResource} always
 * calls through this object, never the underlying functions directly, so a
 * substituted step is honored on the very next sweep.
 *
 * Each step mirrors an already-idempotent Task 5/7 primitive: calling it
 * again after it already succeeded (or already found nothing to do) throws
 * nothing and changes nothing. This is what makes purge resumable without a
 * journal (FR-18) — a re-run simply re-executes every step from the top,
 * and every step before the one that previously failed is a safe no-op.
 */
export const purgeResourceSteps = {
  /** Step 1: inverted index, backlinks, mention index (FR-16's inverse). */
  async removeIndexEntries(
    projectRoot: string,
    resourceId: UUID,
  ): Promise<void> {
    await removeResourceFromIndex(projectRoot, resourceId);
    await removeResourceFromBacklinks(projectRoot, resourceId);
    await removeResourceFromMentionIndex(projectRoot, resourceId);
  },

  /** Step 2: authored entity relationship edges naming this resource. */
  async removeRelationships(
    projectRoot: string,
    resourceId: UUID,
  ): Promise<void> {
    await removeEntityRelationshipsForEntity(projectRoot, resourceId);
  },

  /** Step 3: trashed (or legacy-path) revisions. */
  async purgeRevisions(projectRoot: string, resourceId: UUID): Promise<void> {
    await purgeTrashedRevisions(projectRoot, resourceId);
  },

  /** Step 4: trashed sidecar and its FR-8 nullified-reference record. */
  async purgeSidecarAndRefRecord(
    projectRoot: string,
    resourceId: UUID,
  ): Promise<void> {
    const { trashMetaDir } = trashPaths(projectRoot);
    const sidecarPath = path.join(trashMetaDir, sidecarFilename(resourceId));
    await rm(sidecarPath, { force: true });
    await rm(trashRefRecordPath(projectRoot, resourceId), { force: true });
  },

  /** Step 5, last: trashed resource content files. */
  async purgeContentFiles(
    projectRoot: string,
    resourceId: UUID,
  ): Promise<void> {
    const { trashResourcesDir } = trashPaths(projectRoot);
    let entries: string[];
    try {
      entries = await readdir(trashResourcesDir);
    } catch (err: unknown) {
      if (isEnoent(err)) return;
      throw err;
    }
    for (const e of entries) {
      if (e.startsWith(resourceId + "-")) {
        await rm(path.join(trashResourcesDir, e), {
          recursive: true,
          force: true,
        });
      }
    }
  },
};

/**
 * Permanently removes a trashed resource, running the fixed FR-18 order:
 * (1) inverted index/backlinks/mentions, (2) authored relationship edges,
 * (3) trashed revisions, (4) trashed sidecar + FR-8 ref record, (5) trashed
 * content files, last.
 *
 * On any step's failure, the sweep stops immediately and throws a
 * {@link PurgeSweepError} naming the failed step; every step before it has
 * already taken effect and is left in place, and the resource remains listed
 * in Trash (nothing here removes it from a "currently trashed" listing other
 * than actually deleting its trashed files). Re-running `purgeResource` on
 * the same resource re-executes every step from the top — including the
 * already-completed ones — which is safe because every step is independently
 * idempotent (FR-18: idempotency, not skip-logic, is the resumability
 * mechanism).
 */
export async function purgeResource(
  projectRoot: string,
  resourceId: UUID,
): Promise<void> {
  const steps: [PurgeStepName, () => Promise<void>][] = [
    [
      "index-backlinks-mentions",
      () => purgeResourceSteps.removeIndexEntries(projectRoot, resourceId),
    ],
    [
      "relationships",
      () => purgeResourceSteps.removeRelationships(projectRoot, resourceId),
    ],
    [
      "revisions",
      () => purgeResourceSteps.purgeRevisions(projectRoot, resourceId),
    ],
    [
      "sidecar-and-ref-record",
      () =>
        purgeResourceSteps.purgeSidecarAndRefRecord(projectRoot, resourceId),
    ],
    [
      "content-files",
      () => purgeResourceSteps.purgeContentFiles(projectRoot, resourceId),
    ],
  ];

  for (const [step, run] of steps) {
    try {
      await run();
    } catch (err: unknown) {
      throw new PurgeSweepError(step, resourceId, err);
    }
  }
}

/**
 * Permanently removes a trashed folder and every descendant resource/folder
 * recorded in its Task 6 manifest (FR-7/FR-18).
 *
 * Runs the same {@link purgeResource} five-step sweep, in the same order,
 * against every manifest resource entry (in manifest order — a pre-order
 * walk), stopping and throwing a {@link PurgeSweepError} on the first
 * resource whose sweep fails, before any manifest/descriptor cleanup runs.
 * Only once every descendant resource has been fully purged does it remove
 * every descendant folder's own trashed descriptor, then the manifest
 * itself, then the target folder's own trashed descriptor, last.
 *
 * Resumable the same way {@link purgeResource} is: re-running `purgeFolder`
 * re-walks the manifest from the top. Every already-purged resource's sweep
 * is a safe no-op (each of its five steps is independently idempotent), and
 * removing an already-absent folder descriptor/manifest/target descriptor is
 * a no-op too (`rm`'s `force: true`).
 *
 * Throws if no Task 6 manifest exists for `folderId` and the folder's own
 * trashed descriptor is also absent (nothing left to purge, and nothing was
 * ever recorded — not a resumable partial state).
 */
export async function purgeFolder(
  projectRoot: string,
  folderId: UUID,
): Promise<void> {
  const { trashFoldersDir } = trashPaths(projectRoot);
  const manifestPath = trashFolderManifestPath(projectRoot, folderId);

  let manifest: TrashFolderManifest | undefined;
  try {
    const raw = await readFile(manifestPath, "utf8");
    manifest = TrashFolderManifestSchema.parse(JSON.parse(raw));
  } catch (err: unknown) {
    if (!isEnoent(err)) throw err;
  }

  const trashedDescriptors = await collectFolderDescriptors(trashFoldersDir);
  const trashedByFolderId = new Map(
    trashedDescriptors.map((fd) => [fd.folder.id, fd]),
  );
  const targetTrashedDir = trashedByFolderId.get(folderId)?.dirPath;

  if (!manifest && !targetTrashedDir) {
    throw new Error(`No trashed folder found to purge: ${folderId}`);
  }

  if (manifest) {
    for (const entry of manifest.descendants) {
      if (entry.kind !== "resource") continue;
      await purgeResource(projectRoot, entry.id);
    }

    for (const entry of manifest.descendants) {
      if (entry.kind !== "folder") continue;
      const dirPath = trashedByFolderId.get(entry.id)?.dirPath;
      if (dirPath) {
        await rm(dirPath, { recursive: true, force: true });
      }
    }
  }

  try {
    await rm(manifestPath, { force: true });
  } catch (err: unknown) {
    throw new PurgeSweepError("folder-manifest-and-descriptor", folderId, err);
  }

  if (targetTrashedDir) {
    try {
      await rm(targetTrashedDir, { recursive: true, force: true });
    } catch (err: unknown) {
      throw new PurgeSweepError(
        "folder-manifest-and-descriptor",
        folderId,
        err,
      );
    }
  }
}

/**
 * One trashed resource, listed independently of any trashed folder it may
 * once have lived under (Task 11, FR-1/FR-11). A resource that is itself a
 * descendant of a trashed folder (recorded in that folder's Task 6 manifest)
 * is omitted here — it is surfaced instead via that folder's own
 * {@link TrashedFolderEntry.descendants}, so it is never listed twice.
 */
export interface TrashedResourceEntry {
  id: UUID;
  /** The resource's name at the time it was trashed. */
  originalName: string;
  /** The resource's type (`"text"`, `"image"`, `"audio"`, etc.) at trash time. */
  resourceType: string;
  /** The folder it lived in before being trashed, or `null` for the project root. */
  originalParentId: UUID | null;
  /**
   * When the resource was moved to trash, read from the trashed sidecar
   * file's own mtime. `null` if that file is unexpectedly unreadable (never
   * expected in practice, but not treated as fatal to listing).
   */
  deletedAt: string | null;
}

/**
 * One trashed top-level folder, listed independently of any ancestor trashed
 * folder it may once have lived under — the same top-level-only rule
 * {@link TrashedResourceEntry} follows. `descendants` mirrors Task 6's
 * manifest verbatim (empty when no manifest exists — a legacy trashed folder
 * predating Task 6, resolved OQ-12's "legacy tolerance" extended to listing).
 */
export interface TrashedFolderEntry {
  id: UUID;
  /** The folder's name at the time it was trashed. */
  originalName: string;
  /** The folder it lived in before being trashed, or `null` for the project root. */
  originalParentId: UUID | null;
  /** When the folder was moved to trash, read from its trashed directory's mtime. */
  deletedAt: string | null;
  /** Every descendant folder/resource recorded in the Task 6 manifest, or `[]` if none. */
  descendants: TrashFolderManifestEntry[];
}

/**
 * Lists every currently trashed resource and top-level trashed folder in one
 * combined shape (Task 11, FR-1/FR-2/FR-11, resolved OQ-10 — mirroring how
 * `GET /api/projects` returns a single combined response rather than two
 * separate endpoints).
 *
 * Walks `.trash/meta/` for both trashed resource sidecars and Task 6 folder
 * manifests, and `.trash/folders/` for trashed folder descriptors. A resource
 * or folder recorded as a descendant in another folder's manifest is
 * excluded from its own top-level entry in this result — it is only
 * reachable via that ancestor folder's `descendants` field — so cascade-
 * trashed items are never listed twice.
 *
 * Tolerates a legacy item with no ref record and no folder manifest
 * (resolved OQ-12): a resource sidecar with no corresponding
 * `.trash/meta/refs-<id>.json` is still listed (ref records are irrelevant
 * to listing, only to restore's re-linking), and a folder descriptor with no
 * corresponding `.trash/meta/folder-<id>.json` manifest is still listed,
 * just with an empty `descendants` array.
 */
export async function listTrashedItems(
  projectRoot: string,
): Promise<{
  resources: TrashedResourceEntry[];
  folders: TrashedFolderEntry[];
}> {
  const { trashMetaDir, trashFoldersDir } = trashPaths(projectRoot);

  let metaFiles: string[] = [];
  try {
    metaFiles = await readdir(trashMetaDir);
  } catch (err: unknown) {
    if (!isEnoent(err)) throw err;
  }

  const resourceSidecarFiles = metaFiles.filter(
    (f) => f.startsWith("resource-") && f.endsWith(".meta.json"),
  );
  const folderManifestFiles = metaFiles.filter(
    (f) => f.startsWith("folder-") && f.endsWith(".json"),
  );

  const manifestsByFolderId = new Map<UUID, TrashFolderManifest>();
  for (const file of folderManifestFiles) {
    const folderId = file.replace(/^folder-/, "").replace(/\.json$/, "");
    try {
      const raw = await readFile(path.join(trashMetaDir, file), "utf8");
      manifestsByFolderId.set(
        folderId,
        TrashFolderManifestSchema.parse(JSON.parse(raw)),
      );
    } catch {
      // Malformed or unreadable manifest — treat this folder as legacy
      // (no manifest), rather than failing the whole listing.
    }
  }

  const descendantResourceIds = new Set<UUID>();
  const descendantFolderIds = new Set<UUID>();
  for (const manifest of manifestsByFolderId.values()) {
    for (const entry of manifest.descendants) {
      if (entry.kind === "resource") descendantResourceIds.add(entry.id);
      else descendantFolderIds.add(entry.id);
    }
  }

  const resources: TrashedResourceEntry[] = [];
  for (const file of resourceSidecarFiles) {
    const resourceId = file
      .replace(/^resource-/, "")
      .replace(/\.meta\.json$/, "");
    if (descendantResourceIds.has(resourceId)) continue;

    const filePath = path.join(trashMetaDir, file);
    let sidecar: Record<string, unknown>;
    try {
      sidecar = JSON.parse(await readFile(filePath, "utf8")) as Record<
        string,
        unknown
      >;
    } catch {
      continue;
    }

    let deletedAt: string | null = null;
    try {
      deletedAt = (await stat(filePath)).mtime.toISOString();
    } catch {
      deletedAt = null;
    }

    resources.push({
      id: resourceId,
      originalName:
        typeof sidecar["name"] === "string"
          ? (sidecar["name"] as string)
          : resourceId,
      resourceType:
        typeof sidecar["type"] === "string"
          ? (sidecar["type"] as string)
          : "text",
      originalParentId:
        typeof sidecar["folderId"] === "string"
          ? (sidecar["folderId"] as string)
          : null,
      deletedAt,
    });
  }

  const trashedFolderDescriptors =
    await collectFolderDescriptors(trashFoldersDir);
  const folders: TrashedFolderEntry[] = [];
  for (const fd of trashedFolderDescriptors) {
    if (descendantFolderIds.has(fd.folder.id)) continue;

    let deletedAt: string | null = null;
    try {
      deletedAt = (await stat(fd.dirPath)).mtime.toISOString();
    } catch {
      deletedAt = null;
    }

    const manifest = manifestsByFolderId.get(fd.folder.id);

    folders.push({
      id: fd.folder.id,
      originalName: fd.folder.name,
      originalParentId: fd.folder.parentId ?? null,
      deletedAt,
      descendants: manifest ? manifest.descendants : [],
    });
  }

  return { resources, folders };
}

/**
 * Determines whether `id` names a currently trashed resource or a currently
 * trashed folder (Task 11), so a batch restore/purge route can dispatch to
 * {@link restoreResource}/{@link restoreFolder} or
 * {@link purgeResource}/{@link purgeFolder} without the caller having to know
 * the kind up front.
 *
 * Checks, in order: a trashed sidecar file (resource), a Task 6 manifest
 * (folder — covers a folder mid-purge whose own trashed descriptor was
 * already removed but whose manifest remains), then a trashed folder
 * descriptor under `.trash/folders/` (covers a legacy folder trashed with no
 * manifest, resolved OQ-12). Returns `"unknown"` when none match — the
 * caller reports this as a per-item failure rather than throwing.
 */
export async function resolveTrashedItemKind(
  projectRoot: string,
  id: UUID,
): Promise<"resource" | "folder" | "unknown"> {
  const { trashMetaDir, trashFoldersDir } = trashPaths(projectRoot);

  const sidecarPath = path.join(trashMetaDir, sidecarFilename(id));
  if (await pathExists(sidecarPath)) return "resource";

  const manifestPath = trashFolderManifestPath(projectRoot, id);
  if (await pathExists(manifestPath)) return "folder";

  const descriptors = await collectFolderDescriptors(trashFoldersDir);
  if (descriptors.some((d) => d.folder.id === id)) return "folder";

  return "unknown";
}
