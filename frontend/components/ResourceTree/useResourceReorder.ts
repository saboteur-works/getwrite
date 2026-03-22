import { createOnDropHandler, type ItemInstance } from "@headless-tree/core";
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
 */
export function useResourceReorder({
    dispatch,
    currentProject,
    rawResources,
    transformedResourceData,
    rootItemId,
}: UseResourceReorderOptions) {
    return createOnDropHandler(
        (item: ItemInstance<ResourceItemData>, newChildren: string[]) => {
            transformedResourceData[item.getId()].children = newChildren;

            const uniqueChildren = [...new Set(newChildren)];
            const updateData = uniqueChildren.reduce(
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

                    if (childData.type === "folder") {
                        previous.folderOrder.push({
                            id: childId,
                            orderIndex: previous.folderOrder.length,
                            folderId:
                                item.getId() === rootItemId
                                    ? null
                                    : item.getId(),
                        } as Partial<Folder> & { id: string });

                        transformedResourceData[childId].orderIndex =
                            previous.folderOrder.length - 1;
                    } else {
                        previous.resourceOrder.push({
                            id: childId,
                            orderIndex: previous.resourceOrder.length,
                            folderId:
                                item.getId() === rootItemId
                                    ? null
                                    : item.getId(),
                        } as Partial<AnyResource> & { id: string });

                        transformedResourceData[childId].orderIndex =
                            previous.resourceOrder.length - 1;
                    }

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
        },
    );
}
