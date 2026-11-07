import type {
  AnyResource,
  MetadataValue,
} from "../../../../src/lib/models/types";
import type { FolderRowMetadata } from "../../../../src/lib/folder-data-rows";

/**
 * @module organizerFolderChildren
 * **Feature 102, Task 17 (FR-14).** Lets the Organizer's existing filters
 * apply to folder cards: a folder's `userMetadata` is replaced by its
 * sidecar field values. Same ids, same order. Without metadata (not yet
 * read, or no folder children) the list is returned unchanged.
 */
export function withFolderFieldValues(
  children: AnyResource[],
  byId: Readonly<Record<string, FolderRowMetadata>> | undefined,
): AnyResource[] {
  if (!byId) return children;
  return children.map((child) => {
    if (child.type !== "folder") return child;
    const fieldValues: Record<string, MetadataValue> =
      byId[child.id]?.fieldValues ?? {};
    return { ...child, userMetadata: fieldValues };
  });
}
