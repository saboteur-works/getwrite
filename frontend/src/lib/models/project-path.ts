// Last Updated: 2026-07-15

/**
 * @module project-path
 *
 * Pure guard for validating a client-supplied `projectId` before it is
 * joined against `resolveProjectsDir()` to derive a project's on-disk
 * directory.
 *
 * This is a distinct boundary from `tenant-path.ts`: `tenant-path.ts`
 * validates a `userId` en route to a *tenant's* isolated data root;
 * `project-path.ts` validates a `projectId` en route to a *project's*
 * directory within that root (or within the shared/legacy `projects/`
 * root in single-tenant/desktop deployments). Both boundaries exist in
 * every deployment shape, but they guard different path segments and are
 * intentionally kept in separate modules.
 *
 * Historically, most API routes accepted a client-supplied absolute
 * `projectRoot` string and trusted it outright. That is unsafe: a
 * malicious or malformed `projectRoot`/`projectId` could escape the
 * intended projects directory (path traversal) or otherwise reference a
 * path outside server control. `validateProjectId` closes that hole by
 * requiring every `projectId` to be a well-formed UUID — the same shape
 * every project directory is actually named on disk — before any path is
 * constructed from it. Anything else is rejected outright, with no
 * normalization, trimming, decoding, or partial acceptance.
 */
import { UUID } from "./schemas";

/**
 * Typed, identifiable error thrown by {@link validateProjectId}. Callers
 * and tests can distinguish this from a generic `Error` via
 * `instanceof InvalidProjectIdError`.
 */
export class InvalidProjectIdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidProjectIdError";
  }
}

/**
 * Validates a `projectId` against the canonical UUID validator
 * ({@link UUID} from `schemas.ts`) — the same shape every project
 * directory is named with on disk.
 *
 * Fail-closed: returns `projectId` unchanged only when it is a
 * well-formed UUID string. Everything else (relative or absolute paths,
 * traversal sequences, URL-encoded separators, embedded null bytes, the
 * empty string, or any other non-UUID string) throws
 * {@link InvalidProjectIdError} rather than being normalized, trimmed,
 * decoded, or partially accepted.
 *
 * @param projectId - The candidate project identifier to validate.
 * @returns The same `projectId`, unchanged, when valid.
 * @throws {InvalidProjectIdError} When `projectId` is not a well-formed
 *   UUID string.
 */
export function validateProjectId(projectId: string): string {
  if (!UUID.safeParse(projectId).success) {
    throw new InvalidProjectIdError(
      `Invalid projectId: expected a UUID, received ${JSON.stringify(projectId)}`,
    );
  }
  return projectId;
}

/**
 * Builds the uniform 400 response API routes must return when a
 * client-supplied `projectId` fails {@link validateProjectId}.
 *
 * The response body is fixed and takes no input describing the rejected
 * value or the request — it must never vary based on whether a
 * same-shaped directory actually exists on disk, so it cannot be used to
 * probe for the existence of a project.
 *
 * @returns A `Response` with status 400 and a generic, constant body.
 */
export function respondInvalidProjectId(): Response {
  return Response.json({ error: "Invalid projectId" }, { status: 400 });
}
