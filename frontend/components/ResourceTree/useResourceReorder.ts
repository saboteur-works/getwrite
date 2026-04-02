import {
    isOrderedDragTarget,
    type DragTarget,
    type ItemInstance,
} from "@headless-tree/core";
import type { AnyResource, Folder } from "../../src/lib/models";
import {
    persistReorder,
    updateFolders,
    updateResources,
} from "../../src/store/resourcesSlice";
import type { ResourceItemData } from "./buildResourceTree";
import type { AppDispatch } from "../../src/store/store";

interface UseResourceReorderOptions {
    dispatch: AppDispatch;
    currentProject: { id: string; rootPath: string } | null;
    rawResources: AnyResource[];
    transformedResourceData: Record<string, ResourceItemData>;
    rootItemId: string;
}

/**
 * Returns an `@headless-tree` drop handler that keeps Redux and persistence
 * order payloads aligned with the tree's reordered children list.
 *
 * Unlike `createOnDropHandler` (which calls back twice — once to remove, once
 * to insert — and can trigger a React re-render in between that causes
 * `getChildren` to return stale data for downward moves), this implementation
 * computes the final children list in a single step using `target.insertionIndex`,
 * which headless-tree pre-adjusts to account for the removed dragged items.
 */
export function useResourceReorder({
    dispatch,
    currentProject,
    rawResources,
    transformedResourceData,
    rootItemId,
}: UseResourceReorderOptions) {
    function applyChildrenUpdate(
        item: ItemInstance<ResourceItemData>,
        newChildren: string[],
    ) {
        transformedResourceData[item.getId()].children = newChildren;

        const updateData = newChildren.reduce(
            (previous, childId) => {
                const childData = rawResources.find((resource) => {
                    return resource.id === childId;
                });

                if (!childData) {
                    console.error(
                        `Resource with ID ${childId} not found in raw resources.`,
                    );
                    return previous;
                }

                const newOrderIndex =
                    previous.folderOrder.length + previous.resourceOrder.length;

                if (childData.type === "folder") {
                    previous.folderOrder.push({
                        id: childId,
                        orderIndex: newOrderIndex,
                        folderId:
                            item.getId() === rootItemId ? null : item.getId(),
                    } as Partial<Folder> & { id: string });
                } else {
                    previous.resourceOrder.push({
                        id: childId,
                        orderIndex: newOrderIndex,
                        folderId:
                            item.getId() === rootItemId ? null : item.getId(),
                    } as Partial<AnyResource> & { id: string });
                }

                transformedResourceData[childId].orderIndex = newOrderIndex;

                return previous;
            },
            {
                folderOrder: [] as (Partial<Folder> & { id: string })[],
                resourceOrder: [] as (Partial<AnyResource> & {
                    id: string;
                })[],
            },
        );

        if (updateData.folderOrder.length > 0) {
            dispatch(updateFolders(updateData.folderOrder));
        }

        if (updateData.resourceOrder.length > 0) {
            dispatch(updateResources(updateData.resourceOrder));
        }

        if (!currentProject) {
            return;
        }

        dispatch(
            persistReorder({
                projectId: currentProject.id,
                projectRoot: currentProject.rootPath,
                folderOrder: updateData.folderOrder,
                resourceOrder: updateData.resourceOrder,
            }),
        );
    }

    return (
        items: ItemInstance<ResourceItemData>[],
        target: DragTarget<ResourceItemData>,
    ) => {
        const draggedIds = new Set(items.map((item) => item.getId()));
        const parentItem = target.item;
        const parentId = parentItem.getId();

        // Compute new children for the target parent in one step.
        // target.insertionIndex is pre-adjusted by headless-tree to account for
        // dragged items being removed, so it correctly indexes into
        // childrenWithoutDragged.
        const currentParentChildren = parentItem
            .getChildren()
            .map((i) => i.getId());
        const childrenWithoutDragged = currentParentChildren.filter(
            (id) => !draggedIds.has(id),
        );
        const newParentChildren = isOrderedDragTarget(target)
            ? [
                  ...childrenWithoutDragged.slice(0, target.insertionIndex),
                  ...items.map((i) => i.getId()),
                  ...childrenWithoutDragged.slice(target.insertionIndex),
              ]
            : [...childrenWithoutDragged, ...items.map((i) => i.getId())];

        // For reparenting, also update the old parent(s) to remove the items.
        const oldParents = new Map<
            string,
            ItemInstance<ResourceItemData>
        >();
        for (const item of items) {
            const parent = item.getParent();
            if (parent && parent.getId() !== parentId) {
                oldParents.set(parent.getId(), parent);
            }
        }

        for (const [, oldParentItem] of oldParents) {
            const newOldChildren = oldParentItem
                .getChildren()
                .map((i) => i.getId())
                .filter((id) => !draggedIds.has(id));
            applyChildrenUpdate(oldParentItem, newOldChildren);
        }

        applyChildrenUpdate(parentItem, newParentChildren);

        parentItem.getTree().rebuildTree();
    };
}
