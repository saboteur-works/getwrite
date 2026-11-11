/**
 * @module claims-update-core
 *
 * Change a claim's status, Source link and statement in one write (Feature
 * 108, FR-9, FR-10, FR-11, FR-12).
 *
 * - One validator (`validateUpdateClaim`) runs before any lock; the stored
 *   array is read, checked and replaced inside one `mutateSidecar` call, so
 *   one call is one sidecar write.
 * - `claim.statusChangedAt` is written by this core, and only when the stored
 *   status differs from the requested one. A statement edit, a Source link
 *   change or removal and a re-selection of the same status leave it alone. A
 *   stored status that is not on the list is spread back as stored.
 * - A link is checked against the Source's own sidecar before the write (the
 *   Source's sidecar lock is never taken inside the claim's lock). The target
 *   must be a live Source; a missing, trashed or non-Source id is refused
 *   with a fixed message that does not echo the id. `sourceName` is taken from
 *   the Source's stored name at link time, not from the client, and is not
 *   refreshed by later renames.
 * - An annotation with no `claim` marker is refused and nothing is written.
 * - "Unsourced" is derived from there being no link and is never a status.
 * - Reads and writes go through the storage adapter (`sidecar.ts`); no path
 *   argument is accepted and locked-access errors propagate unchanged.
 *
 * Reachable from `core.ts`, the CLI and the Electron workers: no React, JSX or
 * JSON.
 */
import { mutateSidecar, readSidecar } from "./sidecar";
import { UUID as UuidSchema } from "./schemas";
import { resolveProjectRoot } from "./project-root-resolver";
import { InvalidProjectIdCoreError } from "./project-id-core-error";
import { validateUpdateClaim } from "./annotation-validation";
import {
  AnnotationNotFoundError,
  AnnotationResourceNotFoundError,
  AnnotationResourceTypeError,
  InvalidAnnotationError,
  InvalidAnnotationResourceIdError,
} from "./annotations-core";
import type { UpdateClaimInput } from "./claim-types";
import type {
  Annotation,
  AnnotationTarget,
  ClaimMarker,
  MetadataValue,
} from "./types";

const SOURCE_NAME_LIMIT = 500;
const LINK_REFUSED_MESSAGE = "A claim can only be linked to a Source.";
const NOT_A_CLAIM_MESSAGE = "This annotation is not a claim.";

function isAnnotatableType(type: MetadataValue | undefined): boolean {
  return type === "text" || type === "source";
}

/**
 * Resolve a requested link to the target to store: the validated target with
 * `sourceName` read from the Source's sidecar now.
 */
async function resolveLink(
  projectRoot: string,
  target: AnnotationTarget,
): Promise<AnnotationTarget> {
  const source = await readSidecar(projectRoot, target.sourceId);
  if (source === null || source.type !== "source") {
    throw new InvalidAnnotationError(LINK_REFUSED_MESSAGE);
  }
  const { sourceName: clientName, ...rest } = target;
  void clientName;
  const name = typeof source.name === "string" ? source.name : "";
  return name.length > 0
    ? { ...rest, sourceName: name.slice(0, SOURCE_NAME_LIMIT) }
    : rest;
}

/** Build the stored claim from the current one and the validated update. */
function applyUpdate(
  current: Annotation,
  claim: ClaimMarker,
  update: UpdateClaimInput,
  target: AnnotationTarget | null | undefined,
  now: string,
): Annotation {
  const nextClaim: ClaimMarker =
    update.status !== undefined && update.status !== claim.status
      ? { ...claim, status: update.status, statusChangedAt: now }
      : claim;
  const { target: previousTarget, ...withoutTarget } = current;
  const nextTarget = target === undefined ? previousTarget : target;
  return {
    ...withoutTarget,
    ...(nextTarget === null || nextTarget === undefined
      ? {}
      : { target: nextTarget }),
    ...(update.statement !== undefined ? { body: update.statement } : {}),
    claim: nextClaim,
    updatedAt: now,
  };
}

/**
 * Apply an update to a stored claim inside one `mutateSidecar` write.
 *
 * @param projectId    Server-validated project id.
 * @param resourceId   Text resource id.
 * @param annotationId The claim's annotation id.
 * @param input        Unvalidated {@link UpdateClaimInput}.
 * @returns The stored annotation.
 * @throws InvalidProjectIdCoreError, InvalidAnnotationResourceIdError,
 *   InvalidAnnotationError (bad input, bad link, not a claim),
 *   AnnotationResourceNotFoundError, AnnotationResourceTypeError,
 *   AnnotationNotFoundError; read and locked-access errors unchanged.
 */
export async function updateClaimCore(
  projectId: string,
  resourceId: string,
  annotationId: string,
  input: unknown,
): Promise<Annotation> {
  if (!UuidSchema.safeParse(resourceId).success) {
    throw new InvalidAnnotationResourceIdError();
  }
  if (!UuidSchema.safeParse(annotationId).success) {
    throw new InvalidAnnotationError("An annotation id must be a valid id.");
  }
  const checked = validateUpdateClaim(input);
  if (!checked.ok) throw new InvalidAnnotationError(checked.message);
  const update = checked.value;
  const projectRoot = resolveProjectRoot(projectId);
  if (!projectRoot) throw new InvalidProjectIdCoreError(projectId);
  const link =
    update.target === undefined || update.target === null
      ? update.target
      : await resolveLink(projectRoot, update.target);
  const now = new Date().toISOString();
  let stored: Annotation | undefined;
  await mutateSidecar(projectRoot, resourceId, (sidecar) => {
    if (sidecar === null) throw new AnnotationResourceNotFoundError();
    if (!isAnnotatableType(sidecar.type)) {
      throw new AnnotationResourceTypeError();
    }
    const list: Annotation[] = Array.isArray(sidecar.annotations)
      ? (sidecar.annotations as unknown as Annotation[])
      : [];
    const index = list.findIndex((a) => a.id === annotationId);
    if (index === -1) throw new AnnotationNotFoundError();
    const current = list[index]!;
    if (current.claim === undefined) {
      throw new InvalidAnnotationError(NOT_A_CLAIM_MESSAGE);
    }
    stored = applyUpdate(current, current.claim, update, link, now);
    const next = list.map((a, i) => (i === index ? (stored as Annotation) : a));
    return { ...sidecar, annotations: next as unknown as MetadataValue };
  });
  return stored as Annotation;
}
