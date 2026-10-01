import type { AnyResource, Folder } from "../../../../src/lib/models";
import {
  persistReorder,
  updateFolders,
  updateResources,
} from "../../../../src/store/resourcesSlice";
import type { AppDispatch } from "../../../../src/store/store";

export interface UseOrganizerCardReorderOptions {
  dispatch: AppDispatch;
  currentProject: { id: string; rootPath: string } | null;
  projectDirectoryId: string | null;
  browsedFolderId: string;
  allChildren: AnyResource[];
}

/**
 * Returns a function that takes the browsed Organizer folder's direct
 * children in a new order (as `@dnd-kit/sortable`'s `arrayMove` would
 * produce) and dispatches the optimistic Redux update plus the existing
 * `persistReorder` thunk.
 *
 * This is an explicit, simplified port of `useResourceReorder.ts`'s
 * `applyChildrenUpdate` — scoped to a single parent folder (the browsed
 * Organizer folder), with no re-parenting and no multi-select support. Per
 * OQ-1's resolution, reordering always operates on the full, unfiltered
 * sibling order and reuses the existing `reorderResourcesCore`/
 * `reorderResources`/`persistReorder` transport as-is.
 *
 * Deliberately does not import `@dnd-kit` anywhere in this file — the caller
 * is responsible for computing the reordered id list (e.g. via
 * `arrayMove`) and passing it to the function this hook returns.
 */
export function useOrganizerCardReorder({
  dispatch,
  currentProject,
  projectDirectoryId,
  browsedFolderId,
  allChildren,
}: UseOrganizerCardReorderOptions) {
  return (newChildIds: string[]) => {
    const reorderPayload = newChildIds.reduce(
      (acc, childId) => {
        const childData = allChildren.find((r) => r.id === childId);

        if (!childData) {
          console.error(
            `Resource with ID ${childId} not found in organizer folder children.`,
          );
          return acc;
        }

        const newOrderIndex = acc.folderOrder.length + acc.resourceOrder.length;

        if (childData.type === "folder") {
          acc.folderOrder.push({
            id: childId,
            orderIndex: newOrderIndex,
            parentId: browsedFolderId,
            folderId: browsedFolderId,
          } as Partial<Folder> & { id: string });
        } else {
          acc.resourceOrder.push({
            id: childId,
            orderIndex: newOrderIndex,
            folderId: browsedFolderId,
          } as Partial<AnyResource> & { id: string });
        }

        return acc;
      },
      {
        folderOrder: [] as (Partial<Folder> & { id: string })[],
        resourceOrder: [] as (Partial<AnyResource> & { id: string })[],
      },
    );

    if (reorderPayload.folderOrder.length > 0) {
      dispatch(updateFolders(reorderPayload.folderOrder));
    }

    if (reorderPayload.resourceOrder.length > 0) {
      dispatch(updateResources(reorderPayload.resourceOrder));
    }

    if (!currentProject || !projectDirectoryId) {
      return;
    }

    dispatch(
      persistReorder({
        projectId: projectDirectoryId,
        projectRoot: currentProject.rootPath,
        folderOrder: reorderPayload.folderOrder,
        resourceOrder: reorderPayload.resourceOrder,
      }),
    );
  };
}
