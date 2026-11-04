/**
 * @module annotations-core
 *
 * Transport-agnostic core for a text resource's annotations (Feature 101,
 * FR-10, FR-11, FR-15, FR-23, FR-32). The sidecar `annotations` array is
 * written only here, and only through `mutateSidecar`, so the read happens
 * inside the per-file lock and a concurrent sidecar field save is not lost.
 *
 * - Input is validated by `annotation-validation.ts` before any lock or
 *   write; checks that need the stored array (id collision, the per-resource
 *   cap) run inside the lock on the value `mutateSidecar` read.
 * - The project root comes from a validated `projectId` and the resource id
 *   from a validated UUID; no path argument is accepted.
 * - A resource whose sidecar type is not `text` is refused.
 * - Nothing here touches revisions, `content.txt`, the document or the word
 *   count, and no stored value or message is logged.
 * - Locked-access errors are not caught and propagate unchanged.
 * - This module enqueues no index task itself; `mutateSidecar` keeps its own
 *   post-write enqueue.
 */
import { mutateSidecar, SIDECAR_UNCHANGED } from "./sidecar";
import { UUID as UuidSchema } from "./schemas";
import { resolveProjectRoot } from "./project-root-resolver";
import { InvalidProjectIdCoreError } from "./project-crud-core";
import {
  validateAnnotationBody,
  validateNewAnnotation,
  type NewAnnotationInput,
} from "./annotation-validation";
import type { Annotation, MetadataValue } from "./types";

export { InvalidProjectIdCoreError };

/** A candidate annotation or body was refused. Map to HTTP 400. */
export class InvalidAnnotationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAnnotationError";
  }
}

/** The resource id is not a well-formed id. Map to HTTP 400. */
export class InvalidAnnotationResourceIdError extends Error {
  constructor() {
    super("A resource id must be a valid id.");
    this.name = "InvalidAnnotationResourceIdError";
  }
}

/** The resource is not a text resource (FR-23). Map to HTTP 400. */
export class AnnotationResourceTypeError extends Error {
  constructor() {
    super("Annotations can only be added to text resources.");
    this.name = "AnnotationResourceTypeError";
  }
}

/** The resource has no sidecar to hold annotations. Map to HTTP 404. */
export class AnnotationResourceNotFoundError extends Error {
  constructor() {
    super("The resource was not found.");
    this.name = "AnnotationResourceNotFoundError";
  }
}

/** No annotation with the given id exists on the resource. Map to HTTP 404. */
export class AnnotationNotFoundError extends Error {
  constructor() {
    super("The annotation was not found.");
    this.name = "AnnotationNotFoundError";
  }
}

function requireProjectRoot(projectId: string): string {
  const root = resolveProjectRoot(projectId);
  if (!root) throw new InvalidProjectIdCoreError(projectId);
  return root;
}

function requireResourceId(resourceId: unknown): string {
  if (!UuidSchema.safeParse(resourceId).success) {
    throw new InvalidAnnotationResourceIdError();
  }
  return resourceId as string;
}

function storedAnnotations(
  sidecar: Record<string, MetadataValue>,
): Annotation[] {
  return Array.isArray(sidecar.annotations)
    ? (sidecar.annotations as unknown as Annotation[])
    : [];
}

/** Runs `change` on the stored array inside the lock; refuses missing and non-text sidecars. */
async function mutateAnnotations(
  projectId: string,
  resourceId: string,
  change: (list: Annotation[]) => Annotation[] | typeof SIDECAR_UNCHANGED,
): Promise<void> {
  const validId = requireResourceId(resourceId);
  const projectRoot = requireProjectRoot(projectId);
  await mutateSidecar(projectRoot, validId, (current) => {
    if (current === null) throw new AnnotationResourceNotFoundError();
    if (current.type !== "text") throw new AnnotationResourceTypeError();
    const next = change(storedAnnotations(current));
    if (next === SIDECAR_UNCHANGED) return SIDECAR_UNCHANGED;
    return { ...current, annotations: next as unknown as MetadataValue };
  });
}

/**
 * Add an annotation. `input` is `{ id, body, quote }`; the core sets both
 * timestamps. Returns the stored annotation.
 *
 * @throws InvalidAnnotationError, InvalidAnnotationResourceIdError,
 *   InvalidProjectIdCoreError, AnnotationResourceTypeError,
 *   AnnotationResourceNotFoundError; locked-access errors unchanged.
 */
export async function addAnnotationCore(
  projectId: string,
  resourceId: string,
  input: unknown,
): Promise<Annotation> {
  requireResourceId(resourceId);
  // Shape, id, body and quote checks run here, before any lock; the
  // collision and cap checks repeat inside the lock against the stored array.
  const early = validateNewAnnotation(input, []);
  if (!early.ok) throw new InvalidAnnotationError(early.message);
  const fields: NewAnnotationInput = early.value;
  const now = new Date().toISOString();
  const annotation: Annotation = {
    id: fields.id,
    body: fields.body,
    quote: fields.quote,
    createdAt: now,
    updatedAt: now,
  };
  await mutateAnnotations(projectId, resourceId, (list) => {
    const checked = validateNewAnnotation(fields, list);
    if (!checked.ok) throw new InvalidAnnotationError(checked.message);
    return [...list, annotation];
  });
  return annotation;
}

/**
 * Replace an annotation's body and set `updatedAt`; `quote` and `createdAt`
 * are kept. Returns the stored annotation.
 *
 * @throws as {@link addAnnotationCore}, plus AnnotationNotFoundError.
 */
export async function updateAnnotationCore(
  projectId: string,
  resourceId: string,
  annotationId: string,
  body: unknown,
): Promise<Annotation> {
  requireResourceId(resourceId);
  const checkedBody = validateAnnotationBody(body);
  if (!checkedBody.ok) throw new InvalidAnnotationError(checkedBody.message);
  if (!UuidSchema.safeParse(annotationId).success) {
    throw new InvalidAnnotationError("An annotation id must be a valid id.");
  }
  const updatedAt = new Date().toISOString();
  let stored: Annotation | undefined;
  await mutateAnnotations(projectId, resourceId, (list) => {
    const index = list.findIndex((a) => a.id === annotationId);
    if (index === -1) throw new AnnotationNotFoundError();
    stored = { ...list[index]!, body: checkedBody.value, updatedAt };
    return list.map((a, i) => (i === index ? (stored as Annotation) : a));
  });
  return stored as Annotation;
}

/**
 * Delete an annotation from the sidecar. The document's mark is not touched
 * here. Removing the last annotation deletes the `annotations` key.
 *
 * @throws as {@link updateAnnotationCore}.
 */
export async function deleteAnnotationCore(
  projectId: string,
  resourceId: string,
  annotationId: string,
): Promise<void> {
  requireResourceId(resourceId);
  if (!UuidSchema.safeParse(annotationId).success) {
    throw new InvalidAnnotationError("An annotation id must be a valid id.");
  }
  await mutateAnnotations(projectId, resourceId, (list) => {
    if (!list.some((a) => a.id === annotationId)) {
      throw new AnnotationNotFoundError();
    }
    return list.filter((a) => a.id !== annotationId);
  });
}
