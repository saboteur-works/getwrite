/**
 * @module resource-gone-error
 *
 * Thrown when a metadata save names a resource that has no live sidecar, for
 * example one deleted (moved to Trash) while the save was in flight. The save
 * is refused rather than creating a sidecar: a sidecar written for a trashed
 * resource made it reappear in the tree with no content and no saveable
 * revision (measured, POS note_131ecc62).
 *
 * Leaf module with no imports, so the client can import it to tell this
 * refusal from a failed save.
 */

/** HTTP error code the sidecar route sends with a 404 for this refusal. */
export const RESOURCE_GONE_CODE = "resource-gone";

export class ResourceGoneError extends Error {
  constructor(resourceId: string) {
    super(`Resource ${resourceId} no longer exists.`);
    this.name = "ResourceGoneError";
  }
}
