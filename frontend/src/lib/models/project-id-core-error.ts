/**
 * @module project-id-core-error
 *
 * The error the projectId-keyed core operations throw for a malformed id.
 * Kept in its own module, with no imports, so a model that only needs the
 * error (e.g. `saved-defaults-core`) does not pull in `project-crud-core`
 * and, through it, the bundled project-type JSON. The Electron import
 * worker's typecheck (`electron/tsconfig.worker.json`) has no JSON module
 * support and reaches these models through `@gw/core`.
 */

/**
 * Thrown by the projectId-keyed core operations when `projectId` is not a
 * well-formed UUID. The text is the constant "Invalid projectId", the same
 * as the routes' 400 body and the native backends' refusal, and never echoes
 * the rejected value. The argument is accepted so call sites stay unchanged
 * and is deliberately not used.
 */
export class InvalidProjectIdCoreError extends Error {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept so the call sites stay unchanged; the value is never echoed
  constructor(_projectId?: string | null) {
    super("Invalid projectId");
    this.name = "InvalidProjectIdCoreError";
  }
}
