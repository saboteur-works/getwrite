import fs from "node:fs/promises";
import path from "node:path";
import {
  sidecarPathForProject,
  sidecarFilename,
  readSidecar,
  writeSidecar,
} from "./sidecar";
import type { MetadataValue, UUID } from "./types";

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as Record<string, unknown>)["code"] === "ENOENT"
  );
}

/**
 * Recursively patches a value: if it is a ResourceRef object whose `id`
 * matches `deletedId`, replaces `id` with `null`. Handles arrays of
 * ResourceRef objects (resource-ref fields with `multiple: true`).
 * Works in `unknown` space so callers need not narrow the value first.
 */
function patchRef(
  raw: unknown,
  deletedId: UUID,
): { changed: boolean; value: unknown } {
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (obj["id"] === deletedId && typeof obj["name"] === "string") {
      return { changed: true, value: { id: null, name: obj["name"] } };
    }
    return { changed: false, value: raw };
  }

  if (Array.isArray(raw)) {
    let anyChanged = false;
    const patched = (raw as unknown[]).map((el) => {
      const r = patchRef(el, deletedId);
      if (r.changed) anyChanged = true;
      return r.value;
    });
    return anyChanged
      ? { changed: true, value: patched }
      : { changed: false, value: raw };
  }

  return { changed: false, value: raw };
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
 */
export async function nullifyResourceRefs(
  projectRoot: string,
  deletedResourceId: UUID,
  deletedResourceName: string,
  resourceRefFieldKeys: string[],
): Promise<void> {
  if (resourceRefFieldKeys.length === 0) return;

  const metaDir = path.join(projectRoot, "meta");
  let entries: string[];
  try {
    entries = await fs.readdir(metaDir);
  } catch (err: unknown) {
    if (isEnoent(err)) return;
    throw err;
  }

  const sidecarEntries = entries.filter(
    (e) =>
      e.startsWith("resource-") &&
      e.endsWith(".meta.json") &&
      !e.includes(deletedResourceId),
  );

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
    let dirty = false;

    for (const fieldKey of resourceRefFieldKeys) {
      const value = userMetadata[fieldKey];
      if (value === undefined) continue;

      const result = patchRef(value, deletedResourceId);
      if (result.changed) {
        userMetadata[fieldKey] = result.value as MetadataValue;
        dirty = true;
      }
    }

    if (dirty) {
      sidecar["userMetadata"] = userMetadata;
      await writeSidecar(projectRoot, resourceId, sidecar);
    }
  }
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
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
  const trashRoot = path.join(projectRoot, ".trash");
  const trashResourcesDir = path.join(trashRoot, "resources");
  const trashMetaDir = path.join(trashRoot, "meta");

  await ensureDir(trashResourcesDir);
  await ensureDir(trashMetaDir);

  // Move sidecar if present
  const sidecarSrc = sidecarPathForProject(projectRoot, resourceId);
  const sidecarName = sidecarFilename(resourceId);
  const sidecarDest = path.join(trashMetaDir, sidecarName);
  try {
    await fs.rename(sidecarSrc, sidecarDest);
  } catch (err: unknown) {
    // If file does not exist, ignore; otherwise rethrow
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as any).code === "ENOENT"
    ) {
      // no-op
    } else {
      throw err;
    }
  }

  // Move any resource files matching the resourceId under `resources/`.
  const resourcesDir = path.join(projectRoot, "resources");
  try {
    const entries = await fs.readdir(resourcesDir);
    for (const e of entries) {
      if (e.includes(resourceId)) {
        const src = path.join(resourcesDir, e);
        const dest = path.join(trashResourcesDir, `${resourceId}-${e}`);
        await fs.rename(src, dest);
      }
    }
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as any).code === "ENOENT"
    ) {
      // resources directory missing: ignore
    } else {
      throw err;
    }
  }

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
  const trashRoot = path.join(projectRoot, ".trash");
  const trashResourcesDir = path.join(trashRoot, "resources");
  const trashMetaDir = path.join(trashRoot, "meta");

  // Restore sidecar
  const sidecarName = sidecarFilename(resourceId);
  const sidecarSrc = path.join(trashMetaDir, sidecarName);
  const sidecarDest = sidecarPathForProject(projectRoot, resourceId);
  try {
    await ensureDir(path.dirname(sidecarDest));
    await fs.rename(sidecarSrc, sidecarDest);
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as any).code === "ENOENT"
    ) {
      // sidecar not present in trash
    } else {
      throw err;
    }
  }

  // Restore resource files
  const resourcesDir = path.join(projectRoot, "resources");
  try {
    const entries = await fs.readdir(trashResourcesDir);
    for (const e of entries) {
      if (e.startsWith(resourceId + "-")) {
        const src = path.join(trashResourcesDir, e);
        const originalName = e.replace(`${resourceId}-`, "");
        await ensureDir(resourcesDir);
        const dest = path.join(resourcesDir, originalName);
        await fs.rename(src, dest);
        // restore only one file per matching entry
      }
    }
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as any).code === "ENOENT"
    ) {
      // nothing to restore
    } else {
      throw err;
    }
  }
}

/**
 * Permanently remove resource and sidecar from the trash area.
 */
export async function purgeResource(
  projectRoot: string,
  resourceId: UUID,
): Promise<void> {
  const trashRoot = path.join(projectRoot, ".trash");
  const trashResourcesDir = path.join(trashRoot, "resources");
  const trashMetaDir = path.join(trashRoot, "meta");

  // Delete sidecar from trash
  const sidecarName = sidecarFilename(resourceId);
  const sidecarPath = path.join(trashMetaDir, sidecarName);
  try {
    await fs.rm(sidecarPath, { force: true });
  } catch (err) {
    // ignore
  }

  // Delete resource files from trash
  try {
    const entries = await fs.readdir(trashResourcesDir);
    for (const e of entries) {
      if (e.startsWith(resourceId + "-")) {
        const p = path.join(trashResourcesDir, e);
        await fs.rm(p, { force: true });
      }
    }
  } catch (err) {
    // ignore
  }
}

export default { softDeleteResource, restoreResource, purgeResource };
