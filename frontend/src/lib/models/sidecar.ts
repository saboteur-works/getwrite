import { atomicWriteFile, mkdir, readFile } from "./io";
import path from "node:path";
import type { UUID, MetadataValue, Project } from "./types";
import { withMetaLock } from "./meta-locks";
import { updateProjectJson } from "./project-json-write";
import { withFileLock } from "./file-lock";
import { isLockedAccessError } from "./locked-access";

/**
 * Compute the canonical sidecar filename for a resource id.
 * Example: resource-<uuid>.meta.json
 */
export function sidecarFilename(resourceId: UUID): string {
  return `resource-${resourceId}.meta.json`;
}

/**
 * Compute the sidecar file path inside a project folder.
 * The default location is `<projectRoot>/meta/<sidecarFilename>`.
 */
export function sidecarPathForProject(
  projectRoot: string,
  resourceId: UUID,
): string {
  return path.join(projectRoot, "meta", sidecarFilename(resourceId));
}

/**
 * Adds 1 to `config.metadataRevision` in `project.json` under the per-file
 * lock. Called from `runSidecarWrite` inside `withMetaLock`, so the lock order is
 * `withMetaLock -> project.json lock` (Feature 92, FR-8). A missing
 * `project.json` is ignored; any other read, parse or write error propagates.
 */
async function bumpMetadataRevision(projectRoot: string): Promise<void> {
  try {
    await updateProjectJson(projectRoot, (project) => {
      project.config = project.config ?? ({} as Project["config"]);
      const config = project.config as { metadataRevision?: number };
      config.metadataRevision = (config.metadataRevision ?? 0) + 1;
      return { result: undefined };
    });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
}

/**
 * Read sidecar metadata for a resource from a project root. Returns `null`
 * if the file does not exist.
 *
 * A missing sidecar is an ordinary, expected outcome — not an error — for
 * any resource that has never had one written (e.g. `writeSidecar`'s own
 * pre-write read of the "previous" sidecar for a brand-new resource, or a
 * folder resource, which never gets one at all, per `resource-persistence.ts`).
 * This function stays silent on that path (measured: `writeSidecar`, called
 * from `resource-persistence.ts:200`'s `writeResourceToFile`, read its own
 * about-to-be-created resource's nonexistent sidecar via this function on
 * every single resource created anywhere in the app — including every DOCX
 * import, which triggered it once per resource created — and logged
 * `console.warn("sidecar not found for", ...)` for a condition that was
 * never an error) so a caller checking for an existing sidecar isn't
 * penalized with console noise for the common case of "there isn't one yet".
 *
 * Throws on filesystem or JSON parse errors so callers can handle them.
 */
export async function readSidecar(
  projectRoot: string,
  resourceId: UUID,
): Promise<Record<string, MetadataValue> | null> {
  const filePath = sidecarPathForProject(projectRoot, resourceId);
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as Record<string, MetadataValue>;
  } catch (err: unknown) {
    // If the file doesn't exist, return null — an ordinary, expected
    // outcome, not an error condition worth warning about. Otherwise
    // rethrow.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

function isEntitySidecar(
  sidecar: Record<string, MetadataValue> | null,
): boolean {
  const kind = sidecar?.["entityKind"];
  return typeof kind === "string" && kind.length > 0;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function aliasesEqual(a: unknown, b: unknown): boolean {
  const arrA = toStringArray(a);
  const arrB = toStringArray(b);
  if (arrA.length !== arrB.length) return false;
  return arrA.every((v, i) => v === arrB[i]);
}

/**
 * Decides whether a sidecar write could change what the project's mention
 * index (`meta/index/mentions.json`) reflects for this resource's entity
 * identity — i.e. whether {@link enqueueEntityRescan} (Task 6 / FR-8) should
 * run in addition to the normal per-resource {@link enqueueIndex}.
 *
 * A rescan is needed whenever:
 *  - the resource is becoming an entity for the first time (`entityKind`
 *    absent/empty before, set now) — its terms are new to the alias table
 *    and every resource needs scanning against them;
 *  - the resource was an entity and is losing `entityKind` on this write —
 *    its stale mention records must be removed from the index; or
 *  - the resource was and remains an entity, but its `name` or `aliases`
 *    changed — the set of terms other resources should be matched against
 *    has changed.
 *
 * A resource that neither was nor is an entity, or that stays an entity
 * with unchanged name/aliases, does not need a rescan: the normal
 * `enqueueIndex` pass already re-scans this resource's own content against
 * the (in that case, unchanged) alias table.
 */
function needsEntityRescan(
  previous: Record<string, MetadataValue> | null,
  next: Record<string, MetadataValue>,
): boolean {
  const isPreviouslyEntity = isEntitySidecar(previous);
  const isNowEntity = isEntitySidecar(next);

  if (!isPreviouslyEntity && !isNowEntity) return false;
  if (isPreviouslyEntity !== isNowEntity) return true;

  const isNameChanged = (previous?.["name"] ?? "") !== (next["name"] ?? "");
  const isAliasesChanged = !aliasesEqual(
    previous?.["aliases"],
    next["aliases"],
  );
  return isNameChanged || isAliasesChanged;
}

/** Returned by a {@link mutateSidecar} callback to leave the sidecar as stored. */
export const SIDECAR_UNCHANGED: unique symbol = Symbol("sidecar-unchanged");

export type SidecarMutation =
  | Record<string, MetadataValue>
  | typeof SIDECAR_UNCHANGED;

interface SidecarWriteOutcome {
  previous: Record<string, MetadataValue> | null;
  /** The value now stored, or `null` when nothing was written and none exists. */
  current: Record<string, MetadataValue> | null;
  isWritten: boolean;
}

/**
 * The one read-modify-write of a sidecar (Feature 92, FR-19, FR-20).
 *
 * Sequence, with no file lock inside another: `withMetaLock(projectRoot)` is
 * taken; inside it the sidecar's file lock is taken for the read, `mutate` and
 * the atomic write, and released; then the `metadataRevision` bump takes the
 * `project.json` file lock, still inside `withMetaLock`. `mutate` must not call
 * `writeSidecar`, this function or any lock.
 */
async function runSidecarWrite(
  projectRoot: string,
  resourceId: UUID,
  isReadTolerant: boolean,
  mutate: (
    current: Record<string, MetadataValue> | null,
  ) => SidecarMutation | Promise<SidecarMutation>,
): Promise<SidecarWriteOutcome> {
  const dir = path.join(projectRoot, "meta");
  const filePath = sidecarPathForProject(projectRoot, resourceId);

  return withMetaLock(projectRoot, async () => {
    const outcome = await withFileLock(filePath, async () => {
      let previous: Record<string, MetadataValue> | null = null;
      try {
        previous = await readSidecar(projectRoot, resourceId);
      } catch (err) {
        // A locked-access failure is not "no sidecar exists" and must
        // propagate. Whole-object `writeSidecar` otherwise tolerates an
        // unreadable prior file (it overwrites it); the sink does not.
        if (!isReadTolerant || isLockedAccessError(err)) throw err;
        previous = null;
      }
      // `mutate` gets a copy: a callback that edits it in place and returns
      // it must still differ from `previous`, which decides the entity rescan.
      const next = await mutate(
        previous === null ? null : structuredClone(previous),
      );
      if (next === SIDECAR_UNCHANGED) {
        return { previous, current: previous, isWritten: false };
      }
      await mkdir(dir, { recursive: true });
      // Write-then-rename: readSidecar takes no lock, so an in-place write
      // would let a concurrent reader parse a half-written file.
      await atomicWriteFile(filePath, JSON.stringify(next, null, 2), "utf8");
      return { previous, current: next, isWritten: true };
    });
    // The sidecar lock is released here. Lock order: withMetaLock (held) ->
    // project.json file lock (taken inside the bump); never one file lock in
    // another. The bump never takes withMetaLock itself.
    if (outcome.isWritten) await bumpMetadataRevision(projectRoot);
    return outcome;
  });
}

function enqueueAfterSidecarWrite(
  projectRoot: string,
  resourceId: UUID,
  shouldRescanEntity: boolean,
): void {
  // Enqueue background indexing after sidecar update. Use dynamic import
  // to avoid circular static imports between sidecar and the indexer queue.
  setImmediate(() => {
    import("./indexer-queue")
      .then((m) => {
        const tasks: Promise<void>[] = [
          m.enqueueIndex(projectRoot, resourceId),
        ];
        if (shouldRescanEntity) {
          // `resourceId` doubles as the entity id — an entity IS a resource
          // with `entityKind` set (see `entity-alias-table.ts`).
          tasks.push(m.enqueueEntityRescan(projectRoot, resourceId));
        }
        return Promise.all(tasks);
      })
      .catch(() => {
        /* ignore enqueue errors */
      });
  });
}

/**
 * Read, mutate and write a sidecar as one step (the sink every sidecar writer
 * that derives its new value from the stored one must use). `mutate` receives
 * a copy of the stored value read inside the lock (`null` when absent), which
 * it may edit in place, and returns the
 * value to write, or {@link SIDECAR_UNCHANGED} to write and bump nothing.
 * Returns the value now stored (`null` if none exists). A read error, a
 * locked-access error or a throw from `mutate` propagates unchanged and
 * nothing is written. Bytes, index enqueue and entity rescan enqueue match
 * {@link writeSidecar}; the rescan decision uses the value read in the lock.
 *
 * `options.isReadTolerant` (default false) makes a non-locked-access read
 * error (for example an unparseable file) read as `null` so `mutate` can
 * replace it, as {@link writeSidecar} does; a locked-access error still
 * propagates. For callers whose pre-sink behaviour was that tolerance.
 */
export async function mutateSidecar(
  projectRoot: string,
  resourceId: UUID,
  mutate: (
    current: Record<string, MetadataValue> | null,
  ) => SidecarMutation | Promise<SidecarMutation>,
  options: { isReadTolerant?: boolean } = {},
): Promise<Record<string, MetadataValue> | null> {
  const outcome = await runSidecarWrite(
    projectRoot,
    resourceId,
    options.isReadTolerant ?? false,
    mutate,
  );
  if (outcome.isWritten && outcome.current) {
    enqueueAfterSidecarWrite(
      projectRoot,
      resourceId,
      needsEntityRescan(outcome.previous, outcome.current),
    );
  }
  return outcome.current;
}

/**
 * Write sidecar metadata for a resource into the project's `meta/` folder.
 * Creates directories as needed. Overwrites existing sidecars, under the
 * sidecar's file lock. For first writes of a new id only: a caller that built
 * `metadata` from an earlier read must use {@link mutateSidecar}.
 */
export async function writeSidecar(
  projectRoot: string,
  resourceId: UUID,
  metadata: Record<string, MetadataValue>,
): Promise<void> {
  const outcome = await runSidecarWrite(
    projectRoot,
    resourceId,
    true,
    () => metadata,
  );
  enqueueAfterSidecarWrite(
    projectRoot,
    resourceId,
    needsEntityRescan(outcome.previous, metadata),
  );
}

export default {
  sidecarFilename,
  sidecarPathForProject,
  readSidecar,
  writeSidecar,
  mutateSidecar,
};
