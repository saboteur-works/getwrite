/**
 * @module citations-fields-core
 *
 * Feature 116 (citations at compile), FR-6, FR-21, FR-22: the one writer of a
 * Source sidecar's `citationFields` key, and a read that writes nothing.
 *
 * - The write validates (`citations-fields-validation.ts`) before any lock or
 *   write, then goes through `mutateSidecar` so the read happens inside the
 *   per-file lock; it replaces only the `citationFields` key. It must not be
 *   replaced by `writeResourceToFile`, which overwrites a sidecar whole and
 *   drops the key (`experiments/task-11.md`).
 * - The project root comes from a validated `projectId` and the Source from a
 *   validated `resourceId`; no path argument is accepted.
 * - A resource whose sidecar type is not `source` is refused.
 * - The read returns `{ kind: "fields", fields: null }` for a Source with
 *   none stored and `{ kind: "failed" }` when the sidecar or the stored value
 *   cannot be read: the two never share a return value
 *   (`docs/standards/failure-visibility.md`). The failure message is a fixed
 *   sentence with no stored content and no path.
 * - Locked-access errors are never caught and propagate unchanged.
 * - The stored value lives beside `userMetadata`, never in it, so a custom
 *   field with the same name as a citation field is untouched.
 *
 * Reachable from `core.ts`, the CLI and the Electron workers: no React, JSX,
 * JSON or `node:*`.
 */
import { isLockedAccessError } from "./locked-access";
import { InvalidProjectIdCoreError } from "./project-id-core-error";
import { resolveProjectRoot } from "./project-root-resolver";
import { UUID as UuidSchema } from "./schemas";
import { mutateSidecar, readSidecar } from "./sidecar";
import { CITATION_FIELDS_KEY } from "./citations-types";
import {
  CITATION_FIELDS_REFUSAL,
  validateCitationFields,
  type CitationFields,
} from "./citations-fields-validation";
import type { MetadataValue } from "./types";

export { InvalidProjectIdCoreError };

/** The candidate fields were refused. Map to HTTP 400. */
export class CitationFieldsInvalidError extends Error {
  constructor() {
    super(CITATION_FIELDS_REFUSAL);
    this.name = "CitationFieldsInvalidError";
  }
}

/** The resource id is not a well-formed id. Map to HTTP 400. */
export class CitationFieldsResourceIdError extends Error {
  constructor() {
    super("A resource id must be a valid id.");
    this.name = "CitationFieldsResourceIdError";
  }
}

/** The resource is not a Source. Map to HTTP 400. */
export class CitationFieldsSourceTypeError extends Error {
  constructor() {
    super("Citation fields can only be set on a Source.");
    this.name = "CitationFieldsSourceTypeError";
  }
}

/** The resource has no sidecar. Map to HTTP 404. */
export class CitationFieldsNotFoundError extends Error {
  constructor() {
    super("The resource was not found.");
    this.name = "CitationFieldsNotFoundError";
  }
}

/** Fixed failure sentence of a read; carries no stored content or path. */
export const CITATION_FIELDS_READ_FAILED_MESSAGE =
  "The citation fields could not be read.";

/** Outcome of a read: the stored fields (or none), or a distinct failure. */
export type CitationFieldsReadResult =
  | { kind: "fields"; fields: CitationFields | null }
  | { kind: "failed"; message: typeof CITATION_FIELDS_READ_FAILED_MESSAGE };

function requireProjectRoot(projectId: string): string {
  const root = resolveProjectRoot(projectId);
  if (!root) throw new InvalidProjectIdCoreError(projectId);
  return root;
}

function requireResourceId(resourceId: unknown): string {
  if (!UuidSchema.safeParse(resourceId).success) {
    throw new CitationFieldsResourceIdError();
  }
  return resourceId as string;
}

/**
 * Read a Source's stored citation fields. Writes nothing.
 *
 * @throws InvalidProjectIdCoreError, CitationFieldsResourceIdError,
 *   CitationFieldsNotFoundError, CitationFieldsSourceTypeError; a
 *   locked-access error unchanged.
 */
export async function readCitationFieldsCore(
  projectId: string,
  resourceId: string,
): Promise<CitationFieldsReadResult> {
  const validId = requireResourceId(resourceId);
  const projectRoot = requireProjectRoot(projectId);
  let sidecar: Record<string, MetadataValue> | null;
  try {
    sidecar = await readSidecar(projectRoot, validId);
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    return { kind: "failed", message: CITATION_FIELDS_READ_FAILED_MESSAGE };
  }
  if (sidecar === null) throw new CitationFieldsNotFoundError();
  if (sidecar.type !== "source") throw new CitationFieldsSourceTypeError();
  const stored: unknown = sidecar[CITATION_FIELDS_KEY];
  if (stored === undefined) return { kind: "fields", fields: null };
  const checked = validateCitationFields(stored);
  if (!checked.ok) {
    return { kind: "failed", message: CITATION_FIELDS_READ_FAILED_MESSAGE };
  }
  return { kind: "fields", fields: checked.value };
}

/**
 * Validate and store a Source's citation fields, replacing the stored value.
 * Returns the stored value.
 *
 * @throws CitationFieldsInvalidError (before any lock or write),
 *   CitationFieldsResourceIdError, InvalidProjectIdCoreError,
 *   CitationFieldsNotFoundError, CitationFieldsSourceTypeError; read, write
 *   and locked-access errors unchanged.
 */
export async function writeCitationFieldsCore(
  projectId: string,
  resourceId: string,
  input: unknown,
): Promise<CitationFields> {
  const checked = validateCitationFields(input);
  if (!checked.ok) throw new CitationFieldsInvalidError();
  const validId = requireResourceId(resourceId);
  const projectRoot = requireProjectRoot(projectId);
  await mutateSidecar(projectRoot, validId, (current) => {
    if (current === null) throw new CitationFieldsNotFoundError();
    if (current.type !== "source") throw new CitationFieldsSourceTypeError();
    return {
      ...current,
      [CITATION_FIELDS_KEY]: checked.value as unknown as MetadataValue,
    };
  });
  return checked.value;
}
