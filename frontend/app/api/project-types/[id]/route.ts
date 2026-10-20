import { isHostedAuthActive } from "../../../../src/lib/auth/auth-config";
import {
  deleteSavedProjectType,
  replaceSavedProjectType,
} from "../../../../src/lib/project-types-write-core";
import {
  invalidBodyResponse,
  readCappedJson,
  refusalResponse,
  resultResponse,
} from "../../../../src/lib/project-types-write-http";

/*
 * These handlers are not wrapped by `withStorageContext`. Saved project types
 * are app-level configuration in the directory named by
 * `GETWRITE_SAVED_PROJECT_TYPES_DIR`, read and written on the real filesystem
 * by the write core; they are not project data and never go through the
 * request-scoped storage adapter, so there is no tenant or project context to
 * establish (docs/standards/storage-context.md). Hosted auth makes the core
 * refuse with `saving-unavailable` instead.
 *
 * Nothing here reads a path, file name, directory or `source` from the client.
 * The only inputs are the path `id` (validated by the core before any path is
 * formed) and, on PUT, the spec body (validated strictly by the core).
 */

type Context = { params: Promise<{ id: string }> };

/**
 * `PUT /api/project-types/[id]` replaces a saved type. The body is the whole
 * spec (max 256 KiB); its `id` must equal the path id, else 400 `invalid`.
 * 200 `{ fileName, spec }`, or a refusal `{ error, reason, conflictsWith? }`.
 */
export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = await readCappedJson(request);
  if (!parsed.ok) return invalidBodyResponse();
  const body = parsed.value;
  if (
    typeof body !== "object" ||
    body === null ||
    (body as { id?: unknown }).id !== id
  ) {
    return invalidBodyResponse();
  }
  return resultResponse(
    await replaceSavedProjectType(body, isHostedAuthActive()),
    200,
  );
}

/**
 * `DELETE /api/project-types/[id]` deletes exactly `<id>.json` from the saved
 * directory. 200 `{ fileName }`, or a refusal (built-in 403, not-found 404).
 */
export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const result = await deleteSavedProjectType(id, isHostedAuthActive());
  return result.ok ? resultResponse(result, 200) : refusalResponse(result);
}
