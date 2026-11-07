/**
 * @module resource-id
 *
 * Guard for a client-supplied resource id (or folder id) before any route
 * uses it. Resource and folder ids are always generated UUIDs
 * (`generateUUID`; `ResourceBaseSchema.id`, `FolderSchema.id`), so anything
 * else is refused outright, never normalized. Without it, an id such as
 * `../../x` was joined into a file path and a route wrote outside the
 * project folder (measured against a dev server: the reorder and sidecar
 * routes).
 *
 * Checked at the route boundary, like `validateProjectId`
 * (`project-path.ts`); the native backend has no remote caller.
 * `tests/unit/resource-id-route-guard.test.ts` walks every `[resource-id]`
 * route so a new one cannot skip it.
 */
import { UUID } from "./schemas";

/** True when `value` is a well-formed UUID string. */
export function isResourceId(value: unknown): value is string {
  return UUID.safeParse(value).success;
}

/** True when `value` is an array of well-formed UUID strings. */
export function areResourceIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isResourceId);
}

/** The constant refusal text, shared so a native backend reports the same words. */
export const INVALID_RESOURCE_ID_MESSAGE = "Invalid resource id";

/**
 * The uniform 400 for a refused resource id. The body is constant, so it
 * says nothing about what exists on disk.
 */
export function respondInvalidResourceId(): Response {
  return Response.json({ error: INVALID_RESOURCE_ID_MESSAGE }, { status: 400 });
}
