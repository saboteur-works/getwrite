/**
 * @module inbox-folder-core
 *
 * Resolves a project's Inbox folder (Feature 106, FR-3, FR-4, FR-9, OQ-2,
 * OQ-17) in its three states:
 *
 * - live: `config.inboxFolderId` names a folder in the live tree; returned,
 *   nothing written.
 * - in Trash: a manifest `.trash/meta/folder-<id>.json` exists for the id
 *   (found by a direct read, never by listing Trash). With no choice the
 *   result is `needs-choice` and nothing is written; `restore` restores it
 *   through `restoreFolder`; `new` creates a new Inbox and repoints the id,
 *   leaving the old folder in Trash.
 * - purged, unknown or unset: a new Inbox named "Inbox" is created at the
 *   project root and the id repointed, with no prompt.
 *
 * Reading the id, creating the folder and writing the id are one step inside
 * `withMetaLock(projectRoot)` through `updateProjectJson`; the callback takes
 * no lock (`writeResourceToFile` takes none). The single-flight guarantee is
 * in-process only (`withMetaLock` is a per-process promise chain); it makes
 * no claim about two processes sharing one project directory.
 *
 * If the folder was created and the config write then fails, the folder is
 * removed and the original error is rethrown; a failure of the removal is
 * reported together with the original one. The folder's `special` flag is
 * never read or written. Locked-access errors propagate unchanged.
 */
import path from "node:path";
import { withMetaLock } from "./meta-locks";
import { updateProjectJson } from "./project-json-write";
import { readFile, readdir, rm } from "./io";
import { readFolderTree } from "./folder-utils";
import { createFolderResource } from "./resource-factory";
import { writeResourceToFile } from "./resource-persistence";
import { restoreFolder } from "./trash";
import { resolveProjectRoot } from "./project-root-resolver";
import { InvalidProjectIdCoreError } from "./project-id-core-error";
import type { ProjectConfig } from "./types";
import type {
  CaptureNeedsChoice,
  InboxTrashChoice,
} from "../api/inbox-capture-types";

export { InvalidProjectIdCoreError };

/** Name of a newly created Inbox folder. */
export const INBOX_FOLDER_NAME = "Inbox";

/** The Inbox is a folder id, with what a restore did, if one ran. */
export interface InboxResolved {
  status: "resolved";
  inboxFolderId: string;
  /** True when this call created the folder. */
  created: boolean;
  /** True when a restore put the folder at the root because its parent is gone. */
  relocated: boolean;
  /** True when a restore renamed the folder because of a name collision. */
  renamed: boolean;
}

/** What {@link resolveInboxFolder} returns; a choice is asked for, never guessed. */
export type InboxResolution = InboxResolved | CaptureNeedsChoice;

type Decision =
  | { kind: "live"; id: string }
  | { kind: "trash"; id: string }
  | { kind: "created"; id: string };

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as Record<string, unknown>)["code"] === "ENOENT"
  );
}

/** Same path `trash.ts` `trashFolderManifestPath` builds (that helper is not exported). */
function trashManifestPath(projectRoot: string, folderId: string): string {
  return path.join(projectRoot, ".trash", "meta", `folder-${folderId}.json`);
}

async function liveFolderIds(projectRoot: string): Promise<Set<string>> {
  const tree = await readFolderTree(path.join(projectRoot, "folders"));
  const ids = new Set<string>();
  for (const entry of tree) {
    const id = (entry as { id?: unknown } | null)?.id;
    if (typeof id === "string") ids.add(id);
  }
  return ids;
}

/** True when a Trash manifest exists for the folder; any read error other than absence propagates. */
async function isFolderInTrash(
  projectRoot: string,
  folderId: string,
): Promise<boolean> {
  try {
    await readFile(trashManifestPath(projectRoot, folderId), "utf8");
    return true;
  } catch (err: unknown) {
    if (isEnoent(err)) return false;
    throw err;
  }
}

/** Finds the top-level `folders/<dir>` holding the folder with `folderId`. */
async function findRootFolderDir(
  projectRoot: string,
  folderId: string,
): Promise<string | null> {
  const foldersDir = path.join(projectRoot, "folders");
  for (const name of await readdir(foldersDir)) {
    const dir = path.join(foldersDir, name);
    try {
      const raw = await readFile(path.join(dir, "folder.json"), "utf8");
      if ((JSON.parse(raw) as { id?: unknown }).id === folderId) return dir;
    } catch (err: unknown) {
      if (!isEnoent(err) && !(err instanceof SyntaxError)) throw err;
    }
  }
  return null;
}

/** Removes a folder this call created after the config write failed. */
async function removeCreatedFolder(
  projectRoot: string,
  folderId: string,
  cause: unknown,
): Promise<never> {
  const causeText = cause instanceof Error ? cause.message : String(cause);
  try {
    const dir = await findRootFolderDir(projectRoot, folderId);
    if (dir !== null) await rm(dir, { recursive: true, force: true });
  } catch (removalErr: unknown) {
    const removalText =
      removalErr instanceof Error ? removalErr.message : String(removalErr);
    throw new Error(
      `The Inbox folder could not be saved (${causeText}) and the empty folder it created could not be removed (${removalText}).`,
      { cause },
    );
  }
  throw cause;
}

async function decideAndCreate(
  projectRoot: string,
  choice: InboxTrashChoice | undefined,
  created: { id: string | null },
): Promise<Decision | { kind: "needs-choice" }> {
  return updateProjectJson<Decision | { kind: "needs-choice" }>(
    projectRoot,
    async (project) => {
      const config: Record<string, unknown> = { ...(project.config ?? {}) };
      const id = config["inboxFolderId"];
      if (typeof id === "string" && id !== "") {
        if ((await liveFolderIds(projectRoot)).has(id)) {
          return { result: { kind: "live", id }, shouldWrite: false };
        }
        if (await isFolderInTrash(projectRoot, id)) {
          if (choice === undefined) {
            return { result: { kind: "needs-choice" }, shouldWrite: false };
          }
          if (choice === "restore") {
            return { result: { kind: "trash", id }, shouldWrite: false };
          }
        }
      }
      const folder = createFolderResource({
        name: INBOX_FOLDER_NAME,
        parentFolderId: null,
      });
      await writeResourceToFile(projectRoot, folder);
      created.id = folder.id;
      config["inboxFolderId"] = folder.id;
      project.config = config as unknown as ProjectConfig;
      return { result: { kind: "created", id: folder.id } };
    },
    { durable: process.env.GETWRITE_DURABLE_META === "1" },
  );
}

/**
 * Resolves the Inbox for the project at `projectRoot` (a root already
 * derived from a validated project id; see {@link resolveInboxFolderCore}).
 *
 * @param choice - The writer's answer after a `needs-choice` result. Ignored
 *   unless the Inbox is in Trash.
 */
export async function resolveInboxFolder(
  projectRoot: string,
  choice?: InboxTrashChoice,
): Promise<InboxResolution> {
  return withMetaLock(projectRoot, async () => {
    const created: { id: string | null } = { id: null };
    let decision: Awaited<ReturnType<typeof decideAndCreate>>;
    try {
      decision = await decideAndCreate(projectRoot, choice, created);
    } catch (err: unknown) {
      if (created.id !== null) {
        return removeCreatedFolder(projectRoot, created.id, err);
      }
      throw err;
    }
    if (decision.kind === "needs-choice") {
      return { status: "needs-choice", state: "inbox-in-trash" };
    }
    if (decision.kind === "trash") {
      const restored = await restoreFolder(projectRoot, decision.id);
      return {
        status: "resolved",
        inboxFolderId: decision.id,
        created: false,
        relocated: restored.relocated,
        renamed: restored.renamed,
      };
    }
    return {
      status: "resolved",
      inboxFolderId: decision.id,
      created: decision.kind === "created",
      relocated: false,
      renamed: false,
    };
  });
}

/**
 * As {@link resolveInboxFolder}, from a client-supplied project id: the id is
 * validated before any path is built.
 *
 * @throws InvalidProjectIdCoreError; locked-access errors are rethrown unchanged.
 */
export async function resolveInboxFolderCore(
  projectId: string,
  choice?: InboxTrashChoice,
): Promise<InboxResolution> {
  const projectRoot = resolveProjectRoot(projectId);
  if (!projectRoot) throw new InvalidProjectIdCoreError(projectId);
  return resolveInboxFolder(projectRoot, choice);
}
