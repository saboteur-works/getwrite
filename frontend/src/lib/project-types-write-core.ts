/**
 * @module project-types-write-core
 *
 * Server-side core for creating, replacing and deleting saved project types.
 *
 * Saved types live as `<id>.json` files in the directory named by
 * `GETWRITE_SAVED_PROJECT_TYPES_DIR`. Like the resolver in `projectTypes.ts`
 * this is app-level configuration on the real filesystem, never the
 * request-scoped storage adapter, and it fails closed: an unset variable or
 * active hosted auth refuses every write with `saving-unavailable`.
 *
 * Safety rules enforced here, not left to callers:
 * - The directory comes only from the environment; the file name is always
 *   `<id>.json` for an id that passed {@link validateProjectType} and the
 *   length cap, and the resolved path's parent is asserted to be the saved
 *   directory.
 * - Built-in types are never written, replaced or deleted.
 * - Creation is exclusive (hard link of a finished temporary file), and
 *   replacement is atomic (temporary file renamed over the target).
 * - A refusal carries a short fixed message, never file content or parser text.
 */
import fs from "node:fs";
import path from "node:path";
import {
  projectTypeFieldErrors,
  validateProjectType,
  type ProjectTypeSpec,
} from "./models/schemas";
import { normalizeSubtypeLabel } from "./models/field-subtype-scope";
import { resolveProjectTypes, type ProjectTypeEntry } from "./projectTypes";

/** Longest id accepted; the schema pattern alone has no upper bound. */
export const MAX_PROJECT_TYPE_ID_LENGTH = 64;

/** Why a write was refused or failed. */
export type ProjectTypeWriteRefusalReason =
  | "saving-unavailable"
  | "invalid"
  | "id-clash"
  | "name-clash"
  | "built-in"
  | "not-found"
  | "unreadable"
  | "write-failed";

/** The existing type a clash is with. */
type ProjectTypeConflict = {
  id: string;
  name: string;
  source: "built-in" | "saved";
};

/** Successful write. `spec` is absent for delete. */
type ProjectTypeWriteSuccess = {
  ok: true;
  fileName: string;
  spec?: ProjectTypeSpec;
};

/**
 * Refused or failed write. `conflictsWith` is set for the two clash reasons;
 * `fieldErrors` (schema path joined with "." to the fixed schema message) for
 * an `invalid` refusal that came from the schema, so a client can place each
 * message at its field (Feature 90, FR-28 d).
 */
export type ProjectTypeWriteRefusal = {
  ok: false;
  reason: ProjectTypeWriteRefusalReason;
  message: string;
  conflictsWith?: ProjectTypeConflict;
  fieldErrors?: Record<string, string>;
};

export type ProjectTypeWriteResult =
  | ProjectTypeWriteSuccess
  | ProjectTypeWriteRefusal;

const MESSAGES: Record<ProjectTypeWriteRefusalReason, string> = {
  "saving-unavailable": "Saving project types is not available here.",
  invalid: "The project type is not valid.",
  // Fallbacks only: a clash with a known type names it (see clashMessage).
  "id-clash": "A project type with this id already exists.",
  "name-clash": "A project type with this name already exists.",
  "built-in": "Built-in project types cannot be changed or deleted.",
  "not-found": "No saved project type has this id.",
  unreadable: "The saved project types could not be read.",
  "write-failed": "The project type could not be written.",
};

/** "<name> (<source>) already uses this <id|name>." for the two clash reasons. */
function clashMessage(
  reason: "id-clash" | "name-clash",
  conflict: ProjectTypeConflict,
): string {
  const what = reason === "id-clash" ? "id" : "name";
  return `${conflict.name} (${conflict.source}) already uses this ${what}.`;
}

function refuse(
  reason: ProjectTypeWriteRefusalReason,
  conflictsWith?: ProjectTypeConflict,
): ProjectTypeWriteRefusal {
  if (!conflictsWith) return { ok: false, reason, message: MESSAGES[reason] };
  const message =
    reason === "id-clash" || reason === "name-clash"
      ? clashMessage(reason, conflictsWith)
      : MESSAGES[reason];
  return { ok: false, reason, message, conflictsWith };
}

/** The saved directory, or `null` when saving is unavailable (fail closed). */
function savedDirectory(hostedAuthActive: boolean): string | null {
  const dir = process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR;
  if (!dir || dir.trim() === "" || hostedAuthActive) return null;
  return path.resolve(dir);
}

function isSafeId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= MAX_PROJECT_TYPE_ID_LENGTH &&
    /^[a-z0-9-_]+$/.test(id)
  );
}

/** `<dir>/<id>.json`, asserting the parent is exactly `dir`. */
function targetPath(dir: string, id: string): string | null {
  const target = path.resolve(dir, `${id}.json`);
  return path.dirname(target) === dir ? target : null;
}

function conflictOf(entry: ProjectTypeEntry): ProjectTypeConflict {
  return { id: entry.spec.id, name: entry.spec.name, source: entry.source };
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null
    ? (error as { code?: string }).code
    : undefined;
}

/**
 * Writes `contents` to a new temporary file beside `target`, fsyncs it and
 * returns its path. The temporary file is removed if any step fails.
 */
function writeTemporary(target: string, contents: string): string {
  const directory = path.dirname(target);
  const temporary = path.join(
    directory,
    `.${path.basename(target)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
  );
  let existingMode: number | null = null;
  try {
    existingMode = fs.statSync(target).mode & 0o777;
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
  try {
    const fd = fs.openSync(temporary, "wx");
    try {
      fs.writeFileSync(fd, contents);
      if (existingMode !== null) fs.fchmodSync(fd, existingMode);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch (error) {
    removeQuietly(temporary);
    throw error;
  }
  return temporary;
}

function removeQuietly(file: string): void {
  try {
    fs.rmSync(file, { force: true });
  } catch {
    // The original failure is the one worth reporting.
  }
}

function syncDirectory(directory: string): void {
  try {
    const fd = fs.openSync(directory, "r");
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Swallowed on purpose: the rename or link already succeeded.
  }
}

/**
 * Atomically replaces `target`: write a temporary file, then rename it over
 * the target. A failure leaves the previous bytes and no temporary file.
 * (Modelled on `writeFileViaTemporary` in `electron/src/projects-dir.ts`;
 * not imported across packages. fsync is called in order; no crash-survival
 * claim is made.)
 */
function replaceFile(target: string, contents: string): void {
  const temporary = writeTemporary(target, contents);
  try {
    fs.renameSync(temporary, target);
  } catch (error) {
    removeQuietly(temporary);
    throw error;
  }
  syncDirectory(path.dirname(target));
}

/**
 * Creates `target` only if it does not exist: the finished temporary file is
 * hard-linked to the target, which fails with EEXIST if another writer won.
 *
 * @returns `true` when created, `false` when the target already existed.
 */
function createFileExclusive(target: string, contents: string): boolean {
  const temporary = writeTemporary(target, contents);
  try {
    fs.linkSync(temporary, target);
    return true;
  } catch (error) {
    if (errorCode(error) === "EEXIST") return false;
    throw error;
  } finally {
    removeQuietly(temporary);
    syncDirectory(path.dirname(target));
  }
}

type Checked =
  | { ok: true; dir: string; spec: ProjectTypeSpec; others: ProjectTypeEntry[] }
  | ProjectTypeWriteRefusal;

/** Gate shared by create and replace: availability, validation, readable list. */
async function checkSpec(
  input: unknown,
  hostedAuthActive: boolean,
): Promise<Checked> {
  const dir = savedDirectory(hostedAuthActive);
  if (dir === null) return refuse("saving-unavailable");
  const validated = validateProjectType(input);
  if (!validated.success || !("value" in validated) || !validated.value) {
    const fieldErrors = validated.success
      ? {}
      : projectTypeFieldErrors(validated.issues);
    return Object.keys(fieldErrors).length > 0
      ? { ...refuse("invalid"), fieldErrors }
      : refuse("invalid");
  }
  const spec = validated.value;
  if (!isSafeId(spec.id)) return refuse("invalid");
  const resolution = await resolveProjectTypes(hostedAuthActive);
  if (resolution.savedStatus === "unreadable") return refuse("unreadable");
  return { ok: true, dir, spec, others: resolution.entries };
}

function findNameClash(
  spec: ProjectTypeSpec,
  entries: ProjectTypeEntry[],
): ProjectTypeEntry | undefined {
  const key = normalizeSubtypeLabel(spec.name);
  return entries.find(
    (e) => e.spec.id !== spec.id && normalizeSubtypeLabel(e.spec.name) === key,
  );
}

function serialize(spec: ProjectTypeSpec): string {
  return `${JSON.stringify(spec, null, 2)}\n`;
}

/**
 * Creates a new saved type as `<id>.json`, creating the directory on first
 * save. Refuses `invalid`, `id-clash` (built-in or saved id, also when a
 * concurrent create won), `name-clash` (equal after trim and case-folding),
 * `saving-unavailable`, `unreadable` or `write-failed`.
 *
 * @param input - Untrusted spec; validated with `validateProjectType`.
 * @param hostedAuthActive - Whether hosted auth is active; routes pass
 *   `isHostedAuthActive()`. Required, no default; true refuses `saving-unavailable`.
 */
export async function createSavedProjectType(
  input: unknown,
  hostedAuthActive: boolean,
): Promise<ProjectTypeWriteResult> {
  const checked = await checkSpec(input, hostedAuthActive);
  if (!checked.ok) return checked;
  const { dir, spec, others } = checked;
  const sameId = others.find((e) => e.spec.id === spec.id);
  if (sameId) return refuse("id-clash", conflictOf(sameId));
  const sameName = findNameClash(spec, others);
  if (sameName) return refuse("name-clash", conflictOf(sameName));
  const target = targetPath(dir, spec.id);
  if (target === null) return refuse("invalid");
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (!createFileExclusive(target, serialize(spec))) {
      // A concurrent create won: name the type that now holds the id.
      const winner = (await resolveProjectTypes(false)).entries.find(
        (e) => e.spec.id === spec.id,
      );
      return refuse("id-clash", winner ? conflictOf(winner) : undefined);
    }
  } catch {
    return refuse("write-failed");
  }
  return { ok: true, fileName: `${spec.id}.json`, spec };
}

/**
 * Replaces an existing saved type (same id) atomically. Refuses `built-in` for
 * a built-in id, `not-found` when no `<id>.json` exists, `name-clash` with any
 * other type (never with itself), plus the shared reasons of
 * {@link createSavedProjectType} except `id-clash`.
 *
 * @param input - Untrusted spec; validated with `validateProjectType`.
 * @param hostedAuthActive - Whether hosted auth is active (required, no default).
 */
export async function replaceSavedProjectType(
  input: unknown,
  hostedAuthActive: boolean,
): Promise<ProjectTypeWriteResult> {
  const checked = await checkSpec(input, hostedAuthActive);
  if (!checked.ok) return checked;
  const { dir, spec, others } = checked;
  if (others.some((e) => e.spec.id === spec.id && e.source === "built-in")) {
    return refuse("built-in");
  }
  const target = targetPath(dir, spec.id);
  if (target === null) return refuse("invalid");
  if (!fs.existsSync(target)) return refuse("not-found");
  const sameName = findNameClash(spec, others);
  if (sameName) return refuse("name-clash", conflictOf(sameName));
  try {
    replaceFile(target, serialize(spec));
  } catch {
    return refuse("write-failed");
  }
  return { ok: true, fileName: `${spec.id}.json`, spec };
}

/**
 * Deletes exactly `<id>.json` from the saved directory. Refuses `built-in`
 * for a built-in id, `invalid` for an unsafe id, `not-found`, `unreadable`,
 * `saving-unavailable` or `write-failed`.
 *
 * @param id - Untrusted id; validated before any path is formed.
 * @param hostedAuthActive - Whether hosted auth is active (required, no default).
 */
export async function deleteSavedProjectType(
  id: unknown,
  hostedAuthActive: boolean,
): Promise<ProjectTypeWriteResult> {
  const dir = savedDirectory(hostedAuthActive);
  if (dir === null) return refuse("saving-unavailable");
  if (!isSafeId(id)) return refuse("invalid");
  const resolution = await resolveProjectTypes(hostedAuthActive);
  if (
    resolution.entries.some((e) => e.spec.id === id && e.source === "built-in")
  ) {
    return refuse("built-in");
  }
  const target = targetPath(dir, id);
  if (target === null) return refuse("invalid");
  try {
    fs.unlinkSync(target);
  } catch (error) {
    return refuse(errorCode(error) === "ENOENT" ? "not-found" : "write-failed");
  }
  return { ok: true, fileName: `${id}.json` };
}
