import {
    hotkeysCoreFeature,
    selectionFeature,
    syncDataLoaderFeature,
    dragAndDropFeature,
    FeatureImplementation,
    isOrderedDragTarget,
    ItemInstance,
    DragTarget,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import { AnyResource, Folder } from "../../src/lib/models";
import useAppSelector, { useAppDispatch } from "../../src/store/hooks";
import {
    persistReorder,
    selectFoldersAndResources,
    setSelectedResourceId,
    updateFolder,
    updateResource,
} from "../../src/store/resourcesSlice";
import ResourceContextMenu, {
    ResourceContextAction,
} from "../Tree/ResourceContextMenu";
import { useState, useRef, useMemo } from "react";
import { shallowEqual } from "react-redux";
import {
    ChevronDown,
    ChevronRight,
    FileIcon,
    FolderIcon,
} from "./ResourceTreeIcons";

const INDENTATION_WIDTH = 20;
const ROOT_ITEM_ID = "root";

interface ResourceItemData {
    /** The name of the resource */
    name: string;
    /** The IDs of the resource's children */
    children: string[];
    /** Whether the resource is a folder */
    isFolder: boolean;
    /** The ID of the resource's parent folder */
    parentId: string | null;
    /** Whether the resource can be moved into a new folder */
    special?: boolean;
}

const customClickBehavior: FeatureImplementation = {
    itemInstance: {
        getProps: ({ tree, item, prev }) => ({
            ...prev?.(),
            onClick: (e: MouseEvent) => {
                if (e.shiftKey) {
                    item.selectUpTo(e.ctrlKey || e.metaKey);
                } else if (e.ctrlKey || e.metaKey) {
                    item.toggleSelect();
                } else {
                    tree.setSelectedItems([item.getItemMeta().itemId]);
                }

                item.setFocused();
                prev?.()?.onClick?.(e);
                return {
                    selectedItems: tree.getSelectedItems(),
                    focusedItem: item.getItemMeta().itemId,
                };
            },
        }),
    },
};

/**
 * Transforms a flat list of resources into a nested tree structure suitable for `@headless-tree`s data loader.
 */
function transformResourcesToTreeData(
    resources: AnyResource[],
): Record<string, ResourceItemData> {
    // Create a base object with a root node
    // The root's children will be the top-level resources (those with no folderId)
    const dataObject: Record<string, ResourceItemData> = {
        root: {
            name: "Root",
            children: [],
            isFolder: true,
            parentId: null,
        },
    };

    function addResourceToDataObject(currentResource: AnyResource) {
        // Create the basic structure for the resource and add it to the data object
        const id = currentResource.id;
        const parentId = currentResource.folderId || "root";
        dataObject[id] = {
            name: currentResource.name,
            children: [],
            isFolder: currentResource.type === "folder",
            parentId,
            special:
                currentResource.type === "folder" &&
                "special" in currentResource
                    ? currentResource.special
                    : undefined,
        };

        // Check if the parent resource is already in the data object; if not, add a placeholder for it (this can happen if a child resource is processed before its parent)
        if (!dataObject[parentId]) {
            console.warn(
                `Parent resource with ID ${parentId} not found for resource with ID ${id}. Adding placeholder for parent.`,
            );
            dataObject[parentId] = {
                name: "Placeholder",
                children: [],
                isFolder: true,
                parentId: null,
                special: undefined,
            };
        }

        // Add the resource's ID to its parent's children array
        // When we add a child, we need to check if it's already there to avoid duplicates (in case of multiple resources with the same folderId)
        if (!dataObject[parentId].children.includes(id)) {
            dataObject[parentId].children.push(id);
        }

        // If the resource is a folder, we need to find its children and add them to the data object as well
        if (currentResource.type === "folder") {
            const childResources = resources.filter(
                (res) => res.folderId === currentResource.id,
            );
            childResources.forEach((childRes) =>
                addResourceToDataObject(childRes),
            );
        }
    }

    resources.forEach((res) => addResourceToDataObject(res));
    return dataObject;
}

export default function ResourceTree({
    onResourceAction,
    debug,
}: {
    onResourceAction?: (
        action: ResourceContextAction,
        resourceId?: string,
    ) => void;
    debug?: boolean;
}) {
    const dispatch = useAppDispatch();

    const currentProject = useAppSelector(
        (s) => s.projects.projects[s.projects.selectedProjectId ?? ""] ?? null,
    );

    const rawResources = useAppSelector(
        (s) => selectFoldersAndResources(s.resources),
        shallowEqual,
    );

    const transformedResourceData = useMemo(
        () => transformResourcesToTreeData(rawResources),
        [rawResources],
    );

    const [contextMenu, setContextMenu] = useState<{
        open: boolean;
        x: number;
        y: number;
        resourceId?: string;
        resourceTitle?: string;
    }>({ open: false, x: 0, y: 0 });

    const handleClick = (
        e: React.MouseEvent,
        item: ItemInstance<ResourceItemData>,
    ) => {
        item.setFocused();

        const modificationData = item.getProps().onClick?.(e);

        if (modificationData.selectedItems.length === 1) {
            tree.setSelectedItems([item.getItemMeta().itemId]);
            dispatch(setSelectedResourceId(item.getId()));
        } else {
            tree.setSelectedItems(modificationData.selectedItems);
            item.selectUpTo(e.ctrlKey || e.metaKey);
            dispatch(setSelectedResourceId(modificationData.focusedItem));
        }
    };

    const handleContextMenu = (
        e: React.MouseEvent,
        item: ItemInstance<ResourceItemData>,
    ) => {
        e.preventDefault();
        // open context menu at mouse position for this resource
        const rectX = e.clientX;
        const rectY = e.clientY;
        setContextMenu({
            open: true,
            x: rectX,
            y: rectY,
            resourceId: item.getId(),
            resourceTitle: item.getItemName(),
        });
    };

    const handleDrop = (
        items: ItemInstance<ResourceItemData>[],
        target: DragTarget<ResourceItemData>,
    ) => {
        function getDragTargetChildren(target: DragTarget<ResourceItemData>) {
            return target.item.getItemData().children;
        }

        const targetItemData = target.item.getItemData();

        if (items.length === 1) {
            const droppedItem = items[0];
            if (droppedItem.getItemData().special) {
                console.warn(
                    "Cannot move special resource:",
                    droppedItem.getItemData().name,
                );
                return;
            }

            const droppedItemInitialParent = droppedItem.getParent();

            // Default to adding the dropped item at the end of the new parent's children
            let newIndex: number = getDragTargetChildren(target).length;

            // If the drop target is an ordered position (between two items), use the provided index instead
            if (isOrderedDragTarget(target)) {
                newIndex = target.childIndex;
            }

            // Add the dropped item to the new parent's children
            targetItemData.children.splice(
                newIndex ?? getDragTargetChildren(target).length,
                0,
                droppedItem.getId(),
            );

            /** An array of tuples containing each of the target item's children ids and their new orderIndexes */
            const updatedChildOrderIndex = getDragTargetChildren(target).map(
                (childId, idx) => {
                    return [childId, idx];
                },
            );

            /** Updated parent folderId for the dropped item */
            const targetFolderId =
                target.item.getId() === ROOT_ITEM_ID
                    ? null
                    : target.item.getId();

            /** Update data for the dropped item */
            const updatedDroppedItemData = {
                id: droppedItem.getId(),
                // update both folderId and parentId for compatibility
                // parentId will be deprecated in favor of folderId
                folderId: targetFolderId,
                parentId: targetFolderId,
                orderIndex: newIndex ?? 0,
            } as Partial<Folder> & { id: string };

            /** An array of update data for the dropped item's siblings */
            const updatedSiblingsData = updatedChildOrderIndex
                .filter(([id]) => id !== droppedItem.getId())
                .map(([id, orderIndex]) => ({
                    id,
                    orderIndex,
                })) as Partial<Folder> & { id: string; orderIndex: number }[];

            const updatedSiblingFoldersData = updatedSiblingsData
                .filter((s) => transformedResourceData[s.id].isFolder)
                .map((s) => ({
                    id: s.id,
                    orderIndex: s.orderIndex,
                    folderId: targetFolderId,
                })) as Partial<Folder> & { id: string; orderIndex: number }[];

            const updatedSiblingResourcesData = updatedSiblingsData.filter(
                (s) => !transformedResourceData[s.id].isFolder,
            );

            if (droppedItem.isFolder()) {
                dispatch(updateFolder(updatedDroppedItemData));
                dispatch(
                    persistReorder({
                        projectId: currentProject.id,
                        projectRoot: currentProject.rootPath,
                        folderOrder: [
                            ...updatedSiblingFoldersData,
                            {
                                id: droppedItem.getId(),
                                orderIndex: updatedDroppedItemData.orderIndex!,
                                folderId:
                                    updatedDroppedItemData.folderId ??
                                    undefined,
                            },
                        ],
                        resourceOrder: [...updatedSiblingResourcesData],
                    }),
                );
                updatedSiblingsData.forEach((siblingData) => {
                    if (transformedResourceData[siblingData.id].isFolder) {
                        dispatch(updateFolder(siblingData));
                    } else {
                        dispatch(
                            updateResource(
                                siblingData as Partial<AnyResource> & {
                                    id: string;
                                },
                            ),
                        );
                    }
                });
            } else {
                dispatch(
                    updateResource({
                        id: droppedItem.getId(),
                        folderId: targetFolderId,
                        orderIndex: newIndex ?? 0,
                    } as AnyResource),
                );
                dispatch(
                    persistReorder({
                        projectId: currentProject.id,
                        projectRoot: currentProject.rootPath,
                        folderOrder: [],
                        resourceOrder: [
                            {
                                id: droppedItem.getId(),
                                orderIndex: newIndex ?? 0,
                                folderId: targetFolderId,
                            },
                        ],
                    }),
                );
            }

            // Remove the dropped item from its original parent's children
            droppedItemInitialParent
                ?.getItemData()
                .children.splice(
                    droppedItemInitialParent
                        .getItemData()
                        .children.indexOf(droppedItem.getId()),
                    1,
                );
        } else {
            let newIndex: number = targetItemData.children.length;
            if (isOrderedDragTarget(target)) {
                newIndex = target.childIndex;
            }

            // This assumes that all dragged items have the same original parent
            // Dragging items from multiple parents at once will cause an error
            // and is not currently supported at this time, but could be implemented in the future if needed
            const originalParent = items[0].getParent();

            // Add the dropped items to the new parent's children
            getDragTargetChildren(target).splice(
                newIndex ?? getDragTargetChildren(target).length,
                0,
                ...items.map((i) => i.getId()),
            );

            const updatedFolderOrder = items
                .filter((item) => item.isFolder())
                .map((item, idx) => {
                    const newFolderId =
                        target.item.getId() === "root"
                            ? null
                            : target.item.getId();
                    return {
                        id: item.getId(),
                        orderIndex: newIndex! + idx,
                        folderId: newFolderId,
                    } as Partial<Folder> & { id: string; orderIndex: number };
                });
            const updatedResourceOrder = items
                .filter((item) => !item.isFolder())
                .map((item, idx) => {
                    return {
                        id: item.getId(),
                        orderIndex: newIndex! + idx,
                        folderId:
                            target.item.getId() === "root"
                                ? null
                                : target.item.getId(),
                    } as Partial<AnyResource> & {
                        id: string;
                        orderIndex: number;
                    };
                });

            dispatch(
                persistReorder({
                    projectId: currentProject.id,
                    projectRoot: currentProject.rootPath,
                    folderOrder: updatedFolderOrder,
                    resourceOrder: updatedResourceOrder,
                }),
            );

            const newFolderId =
                target.item.getId() === "root" ? null : target.item.getId();
            items.forEach((item, idx) => {
                if (item.isFolder()) {
                    dispatch(
                        updateFolder({
                            id: item.getId(),
                            folderId: newFolderId,
                            parentId: newFolderId,
                            orderIndex: idx,
                        } as Folder),
                    );
                } else {
                    dispatch(
                        updateResource({
                            id: item.getId(),
                            folderId: newFolderId,
                            orderIndex: idx,
                        } as AnyResource),
                    );
                }
            });

            // Remove the dropped items from their original parent's children
            items.forEach((item) => {
                originalParent
                    ?.getItemData()
                    .children.splice(
                        originalParent
                            .getItemData()
                            .children.indexOf(item.getId()),
                        1,
                    );
            });
        }

        tree.rebuildTree();
    };

    const renderResourceIcon = (item: ItemInstance<ResourceItemData>) => {
        return item.isFolder() ? <FolderIcon /> : <FileIcon />;
    };

    const renderExpandableStateIcon = (
        item: ItemInstance<ResourceItemData>,
    ) => {
        return item.isExpanded() ? <ChevronDown /> : <ChevronRight />;
    };

    const tree = useTree<ResourceItemData>({
        rootItemId: ROOT_ITEM_ID,
        getItemName: (item) => {
            return item.getItemData().name;
        },
        isItemFolder: (item) => item.getItemData().isFolder,
        dataLoader: {
            getItem: (itemId) => transformedResourceData[itemId],
            getChildren: (itemId) => {
                return transformedResourceData[itemId].children;
            },
        },
        indent: INDENTATION_WIDTH,
        onPrimaryAction: (item) => {
            dispatch(setSelectedResourceId(item.getId()));
        },
        onDrop: (items, target) => {
            handleDrop(items, target);
        },
        canReorder: true,
        features: [
            syncDataLoaderFeature,
            selectionFeature,
            hotkeysCoreFeature,
            customClickBehavior,
            dragAndDropFeature,
        ],
    });

    return (
        <div
            {...tree.getContainerProps()}
            className="flex flex-col items-start mb-8"
        >
            {tree.getItems().map((item) => (
                <div
                    key={item.getId()}
                    style={{
                        paddingLeft: `${item.getItemMeta().level * 20}px`,
                    }}
                    onContextMenu={(e) => {
                        handleContextMenu(e, item);
                    }}
                >
                    {item.isFolder() && (
                        <button
                            onClick={
                                item.isExpanded() ? item.collapse : item.expand
                            }
                        >
                            {renderExpandableStateIcon(item)}
                        </button>
                    )}
                    <button
                        {...item.getProps()}
                        key={item.getId()}
                        onClick={(e) => {
                            handleClick(e, item);
                        }}
                    >
                        <div
                            className={`flex items-center gap-2 ${item.isDragTarget() ? "bg-gray-400 rounded-md" : ""}`}
                        >
                            {renderResourceIcon(item)}
                            <div
                                className={`${item.isSelected() ? "font-bold" : ""}`}
                            >
                                {item.getItemName()}
                            </div>
                        </div>
                    </button>
                </div>
            ))}
            <div style={tree.getDragLineStyle()} className="dragline" />
            <ResourceContextMenu
                open={contextMenu.open}
                x={contextMenu.x}
                y={contextMenu.y}
                resourceId={contextMenu.resourceId}
                resourceTitle={contextMenu.resourceTitle}
                onClose={() => setContextMenu((s) => ({ ...s, open: false }))}
                onAction={(action, resourceId) => {
                    onResourceAction?.(action, resourceId);
                }}
            />
        </div>
    );
}
