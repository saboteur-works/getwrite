/**
 * @module lib/api/locked-response
 *
 * Turns the server's locked-project response back into the locked-access
 * error classes the native transports throw, so one `isLockedAccessError`
 * check covers both transports. The server maps a locked project in
 * `app/api/_tenant/with-storage-context.ts`: `ProjectLockedError` -> 401,
 * `MissingProjectKeyError` -> 409, both `{ error }`.
 *
 * A 401 carrying the request gate's `x-getwrite-gate: not-paired` header is a
 * device that is not paired, not a locked project, and is left alone.
 *
 * Imports only the leaf `locked-errors` module, so it is safe in the browser
 * bundle.
 */
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../models/crypto/locked-errors";

const GATE_HEADER = "x-getwrite-gate";
const NOT_PAIRED = "not-paired";

/**
 * @param response - The failed response (only `status` and, for a 401, `headers` are read).
 * @param projectId - The project the request addressed, for the error text.
 * @returns The matching locked-access error, or `null` for any other response.
 */
export function lockedAccessErrorFromResponse(
  response: Pick<Response, "status" | "headers">,
  projectId: string,
): ProjectLockedError | MissingProjectKeyError | null {
  if (response.status === 409) return new MissingProjectKeyError(projectId);
  if (response.status !== 401) return null;
  if (response.headers.get(GATE_HEADER) === NOT_PAIRED) return null;
  return new ProjectLockedError(projectId);
}
