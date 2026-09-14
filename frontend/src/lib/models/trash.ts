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
import { getLocalResources } from "./resource-persistence";
import { getSchema } from "./metadata-schema";
import {
  FolderSchema,
  TrashRefRecordSchema,
  TrashFolderManifestSchema,
  type TrashFolderManifest,
  type TrashFolderManifestEntry,
  type TrashRefRecord,
  type TrashRefRecordEntry,
} from "./schemas";
import type { AnyResource, Folder, MetadataValue, UUID } from "./types";

export type {
  TrashFolderManifest,
  TrashFolderManifestEntry,
  TrashRefRecord,
  TrashRefRecordEntry,
};

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
 * Restore resource and sidecar from `.trash/` back to their original locations.
 * If multiple resource filenames exist in the trash, restores the first match.
 */
export async function restoreResource(
  projectRoot: string,
  resourceId: UUID,
): Promise<void> {
  const { trashResourcesDir, trashMetaDir } = trashPaths(projectRoot);

  // Restore sidecar
  const sidecarName = sidecarFilename(resourceId);
  const sidecarSrc = path.join(trashMetaDir, sidecarName);
  const sidecarDest = sidecarPathForProject(projectRoot, resourceId);
  try {
    await mkdir(path.dirname(sidecarDest), { recursive: true });
    await rename(sidecarSrc, sidecarDest);
  } catch (err: unknown) {
    // sidecar not present in trash
    if (!isEnoent(err)) throw err;
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
  } catch (err: unknown) {
    if (!isEnoent(err)) throw err;
    return;
  }

  const revisionsDest = revisionsBaseDir(projectRoot, resourceId);
  await mkdir(path.dirname(revisionsDest), { recursive: true });
  await rename(trashedRevisionsDir, revisionsDest);
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
 * Permanently remove resource and sidecar from the trash area.
 */
export async function purgeResource(
  projectRoot: string,
  resourceId: UUID,
): Promise<void> {
  const { trashResourcesDir, trashMetaDir } = trashPaths(projectRoot);

  // Delete sidecar from trash
  const sidecarName = sidecarFilename(resourceId);
  const sidecarPath = path.join(trashMetaDir, sidecarName);
  try {
    await rm(sidecarPath, { force: true });
  } catch {
    // ignore
  }

  // Delete resource files from trash
  try {
    const entries = await readdir(trashResourcesDir);
    for (const e of entries) {
      if (e.startsWith(resourceId + "-")) {
        const p = path.join(trashResourcesDir, e);
        await rm(p, { force: true });
      }
    }
  } catch {
    // ignore
  }
}

export default {
  softDeleteResource,
  softDeleteFolder,
  restoreResource,
  purgeResource,
  purgeTrashedRevisions,
};
