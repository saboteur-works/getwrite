/**
 * @module claims-list-core
 *
 * Project-wide claim list (Feature 108, FR-17). A scan of every text
 * resource's sidecar when called: no new store and no index (OQ-9).
 *
 * - Reads go through the storage adapter (`io.ts`, `sidecar.ts`); `node:fs` is
 *   not used, so a hosted tenant's `StorageContext` scopes the read.
 * - The project root comes from a validated `projectId`; no path is accepted.
 * - A resource whose sidecar cannot be read is named in `failures`, with the
 *   claims of the others still returned. A failed read never renders as "no
 *   claims" (`docs/standards/failure-visibility.md`). A failure message is a
 *   fixed sentence: it carries no stored content and no path.
 * - A locked-access error is rethrown unchanged, from the listing and from any
 *   sidecar read, so a locked project is never an empty or partial list.
 * - A resource in Trash is not under `resources/`, so it is not scanned.
 * - Citation state (a removed Source) is derived by the caller, not here.
 *
 * Reachable from `core.ts`, the CLI and the Electron workers: no React, JSX or
 * JSON.
 */
import { readFile } from "./io";
import { isLockedAccessError } from "./locked-access";
import { listResourceIdsStrict } from "./list-resource-ids-strict";
import { InvalidProjectIdCoreError } from "./project-id-core-error";
import { PROJECT_FILENAME } from "./project-config";
import { resolveProjectRoot } from "./project-root-resolver";
import { readSidecar } from "./sidecar";
import type {
  ClaimListEntry,
  ClaimListResult,
  ClaimReadFailure,
} from "./claim-types";
import type { Annotation, MetadataValue } from "./types";

export { InvalidProjectIdCoreError };

/** The project does not exist in the caller's storage scope. Map to HTTP 404. */
export class ClaimProjectNotFoundError extends Error {
  constructor() {
    super("The project was not found.");
    this.name = "ClaimProjectNotFoundError";
  }
}

/**
 * The claim list plus the count of sidecars read, recorded by Task 1's
 * measurement (FR-1(e)).
 */
export interface ClaimListOutcome extends ClaimListResult {
  sidecarsRead: number;
}

const READ_FAILED_MESSAGE = "This resource's annotations could not be read.";
const MALFORMED_MESSAGE =
  "This resource's annotations are not in a valid form.";

/** Types whose sidecar holds annotations (as `annotations-core.ts`). */
function isAnnotatableType(type: MetadataValue | undefined): boolean {
  return type === "text" || type === "source";
}

function isClaim(value: unknown): value is Annotation {
  if (typeof value !== "object" || value === null) return false;
  const claim = (value as { claim?: unknown }).claim;
  return typeof claim === "object" && claim !== null && !Array.isArray(claim);
}

async function assertProjectExists(projectRoot: string): Promise<void> {
  try {
    await readFile(`${projectRoot}/${PROJECT_FILENAME}`, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ClaimProjectNotFoundError();
    }
    throw err;
  }
}

/** Outcome of reading one resource: its claims, or the failure naming it. */
type ResourceScan =
  | { kind: "skipped" }
  | { kind: "read"; entries: ClaimListEntry[] }
  | { kind: "failed"; failure: ClaimReadFailure };

async function scanResource(
  projectRoot: string,
  resourceId: string,
): Promise<ResourceScan> {
  let sidecar: Record<string, MetadataValue> | null;
  try {
    sidecar = await readSidecar(projectRoot, resourceId);
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    return {
      kind: "failed",
      failure: { resourceId, resourceName: "", message: READ_FAILED_MESSAGE },
    };
  }
  if (sidecar === null || !isAnnotatableType(sidecar.type)) {
    return { kind: "skipped" };
  }
  const resourceName = typeof sidecar.name === "string" ? sidecar.name : "";
  const stored: unknown = sidecar.annotations;
  if (stored === undefined) return { kind: "read", entries: [] };
  if (!Array.isArray(stored)) {
    return {
      kind: "failed",
      failure: { resourceId, resourceName, message: MALFORMED_MESSAGE },
    };
  }
  const entries = (stored as unknown[])
    .filter(isClaim)
    .map((annotation) => ({ resourceId, resourceName, annotation }));
  return { kind: "read", entries };
}

/**
 * List every claim in the project, plus the resources whose annotations could
 * not be read.
 *
 * @param projectId Server-validated project id.
 * @throws InvalidProjectIdCoreError, ClaimProjectNotFoundError, and a
 *   locked-access error unchanged.
 */
export async function listClaimsCore(
  projectId: string,
): Promise<ClaimListOutcome> {
  const projectRoot = resolveProjectRoot(projectId);
  if (!projectRoot) throw new InvalidProjectIdCoreError(projectId);
  await assertProjectExists(projectRoot);
  const resourceIds = await listResourceIdsStrict(projectRoot);
  const claims: ClaimListEntry[] = [];
  const failures: ClaimReadFailure[] = [];
  let sidecarsRead = 0;
  for (const resourceId of resourceIds) {
    const scan = await scanResource(projectRoot, resourceId);
    if (scan.kind === "failed") failures.push(scan.failure);
    else if (scan.kind === "read") {
      sidecarsRead += 1;
      claims.push(...scan.entries);
    } else sidecarsRead += 1;
  }
  return { claims, failures, sidecarsRead };
}
