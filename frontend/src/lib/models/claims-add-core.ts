/**
 * @module claims-add-core
 *
 * Create a claim in one write (Feature 108, FR-7, FR-9 start status, FR-10,
 * FR-21 core).
 *
 * - The claim is an annotation carrying `claim: { status: "unverified",
 *   statusChangedAt }`; the status and its date are written here, never taken
 *   from the client (`validateNewClaim` refuses them as unknown keys).
 * - One `mutateSidecar` call does the read and the write inside the per-file
 *   lock; the collision and 500-per-resource checks repeat there against the
 *   stored array, which counts claims and notes together.
 * - Shape, statement and quote checks run before the lock; an empty
 *   selection (empty quote) is refused here, as the shared quote validator
 *   accepts an empty quote for a note.
 * - Only a `text` resource is accepted: an image, audio or Source resource is
 *   refused and nothing is written.
 * - Reads and writes go through the storage adapter (`sidecar.ts`); `node:fs`
 *   is not used. The project root comes from a validated `projectId`; no path
 *   is accepted.
 * - Locked-access errors are not caught and propagate unchanged.
 *
 * Reachable from `core.ts`, the CLI and the Electron workers: no React, JSX or
 * JSON.
 */
import {
  AnnotationResourceNotFoundError,
  AnnotationResourceTypeError,
  InvalidAnnotationError,
  InvalidAnnotationResourceIdError,
} from "./annotations-core";
import { validateNewClaim } from "./annotation-validation";
import { InvalidProjectIdCoreError } from "./project-id-core-error";
import { resolveProjectRoot } from "./project-root-resolver";
import { UUID as UuidSchema } from "./schemas";
import { mutateSidecar } from "./sidecar";
import type { Annotation, MetadataValue } from "./types";

/**
 * Store a new claim annotation with `claim: { status: "unverified",
 * statusChangedAt }` in one `mutateSidecar` write.
 *
 * @param projectId  Server-validated project id.
 * @param resourceId Text resource id.
 * @param input      Unvalidated {@link import("./claim-types").NewClaimInput}.
 * @returns The stored annotation.
 * @throws InvalidAnnotationError, InvalidAnnotationResourceIdError,
 *   InvalidProjectIdCoreError, AnnotationResourceTypeError,
 *   AnnotationResourceNotFoundError; locked-access errors unchanged.
 */
export async function addClaimCore(
  projectId: string,
  resourceId: string,
  input: unknown,
): Promise<Annotation> {
  if (!UuidSchema.safeParse(resourceId).success) {
    throw new InvalidAnnotationResourceIdError();
  }
  const projectRoot = resolveProjectRoot(projectId);
  if (!projectRoot) throw new InvalidProjectIdCoreError(projectId);
  const early = validateNewClaim(input, []);
  if (!early.ok) throw new InvalidAnnotationError(early.message);
  const fields = early.value;
  if (fields.quote.length === 0) {
    throw new InvalidAnnotationError("Select some text to mark as a claim.");
  }
  const now = new Date().toISOString();
  const annotation: Annotation = {
    id: fields.id,
    body: fields.statement,
    quote: fields.quote,
    ...(fields.target === undefined ? {} : { target: fields.target }),
    claim: { status: "unverified", statusChangedAt: now },
    createdAt: now,
    updatedAt: now,
  };
  await mutateSidecar(projectRoot, resourceId, (current) => {
    if (current === null) throw new AnnotationResourceNotFoundError();
    if (current.type !== "text") throw new AnnotationResourceTypeError();
    const stored: Annotation[] = Array.isArray(current.annotations)
      ? (current.annotations as unknown as Annotation[])
      : [];
    const checked = validateNewClaim(fields, stored);
    if (!checked.ok) throw new InvalidAnnotationError(checked.message);
    return {
      ...current,
      annotations: [...stored, annotation] as unknown as MetadataValue,
    };
  });
  return annotation;
}
