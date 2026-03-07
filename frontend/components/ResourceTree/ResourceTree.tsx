import {
    hotkeysCoreFeature,
    selectionFeature,
    syncDataLoaderFeature,
    dragAndDropFeature,
    FeatureImplementation,
    isOrderedDragTarget,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import { AnyResource, Folder } from "../../src/lib/models";
import useAppSelector, { useAppDispatch } from "../../src/store/hooks";
import { selectProject } from "../../src/store/projectsSlice";
import {
    selectFoldersAndResources,
    setSelectedResourceId,
    updateFolder,
    updateResource,
} from "../../src/store/resourcesSlice";
import ResourceContextMenu, {
    type ResourceContextAction,
} from "../Tree/ResourceContextMenu";
import { useState, useRef } from "react";
interface ResourceItemData {
    /** The name of the resource */
    name: string;
    /** The IDs of the resource's children */
    children: string[];
    /** Whether the resource is a folder */
    isFolder: boolean;
    parentId: string | null;
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

function ChevronDown({ className = "w-3 h-3" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
            <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function ChevronRight({ className = "w-3 h-3" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
            <path
                d="M9 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function FileIcon({ className = "w-4 h-4" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
            <path
                d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M14 3v6h6"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function FolderIcon({ className = "w-4 h-4" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
            <path
                d="M3 7.5A2.5 2.5 0 015.5 5h3l1.5 2h7A2 2 0 0120 9v8a2 2 0 01-2 2H6a2 2 0 01-2-2V7.5z"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

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
        };

        // Check if the parent resource is already in the data object; if not, add a placeholder for it (this can happen if a child resource is processed before its parent)
        if (!dataObject[parentId]) {
            console.log(
                `Parent resource with ID ${parentId} not found for resource with ID ${id}. Adding placeholder for parent.`,
            );
            dataObject[parentId] = {
                name: "Placeholder",
                children: [],
                isFolder: true,
                parentId: null,
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

function transformTreeDataToResources(
    treeData: Record<string, ResourceItemData>,
    resources: AnyResource[],
): AnyResource[] {
    Object.entries(treeData).forEach(([id, itemData]) => {});

    return resources;
}
export default function ResourceTree({
    projectId,
    debug,
}: {
    projectId: string;
    debug?: boolean;
}) {
    const foldersAndResources = useAppSelector((s) =>
        selectFoldersAndResources(s.resources),
    );
    const dispatch = useAppDispatch();
    const clickedNode = useRef<string | null>(null);
    const [resourceData, setResourceData] = useState(
        transformResourcesToTreeData(foldersAndResources),
    );

    const [contextMenu, setContextMenu] = useState<{
        open: boolean;
        x: number;
        y: number;
        resourceId?: string;
        resourceTitle?: string;
    }>({ open: false, x: 0, y: 0 });

    const tree = useTree<ResourceItemData>({
        rootItemId: "root",
        getItemName: (item) => {
            return item.getItemData().name;
        },
        isItemFolder: (item) => item.getItemData().isFolder,
        dataLoader: {
            getItem: (itemId) => resourceData[itemId],
            getChildren: (itemId) => {
                return resourceData[itemId].children;
            },
        },
        onPrimaryAction: (item) => {
            console.log("Primary action on item:", item.getItemData().name);
        },
        onDrop: (items, target) => {
            const newParent = target;
            if (items.length === 1) {
                const droppedItem = items[0];
                const originalParent = droppedItem.getParent();
                let newIndex: number | null = null;
                if (isOrderedDragTarget(target)) {
                    newIndex = target.childIndex;
                }

                // Add the dropped item to the new parent's children
                newParent.item
                    .getItemData()
                    .children.splice(
                        newIndex ??
                            newParent.item.getItemData().children.length,
                        0,
                        droppedItem.getId(),
                    );
                if (droppedItem.isFolder()) {
                    const newFolderId =
                        newParent.item.getId() === "root"
                            ? null
                            : newParent.item.getId();
                    dispatch(
                        updateFolder({
                            id: droppedItem.getId(),
                            folderId: newFolderId,
                            parentId: newFolderId,
                        } as Folder),
                    );
                } else {
                    dispatch(
                        updateResource({
                            id: droppedItem.getId(),
                            folderId:
                                newParent.item.getId() === "root"
                                    ? null
                                    : newParent.item.getId(),
                        } as AnyResource),
                    );
                }

                // Remove the dropped item from its original parent's children
                originalParent
                    ?.getItemData()
                    .children.splice(
                        originalParent
                            .getItemData()
                            .children.indexOf(droppedItem.getId()),
                        1,
                    );
            } else {
                let newIndex: number | null = null;
                if (isOrderedDragTarget(target)) {
                    newIndex = target.childIndex;
                }
                // This assumes that all dragged items have the same original parent, which should be the case with the current implementation of multi-drag in headless-tree
                const originalParent = items[0].getParent();

                // Add the dropped items to the new parent's children
                newParent.item
                    .getItemData()
                    .children.splice(
                        newIndex ??
                            newParent.item.getItemData().children.length,
                        0,
                        ...items.map((i) => i.getId()),
                    );

                items.forEach((item) => {
                    if (item.isFolder()) {
                        const newFolderId =
                            newParent.item.getId() === "root"
                                ? null
                                : newParent.item.getId();
                        dispatch(
                            updateFolder({
                                id: item.getId(),
                                folderId: newFolderId,
                                parentId: newFolderId,
                            } as Folder),
                        );
                    } else {
                        dispatch(
                            updateResource({
                                id: item.getId(),
                                folderId:
                                    newParent.item.getId() === "root"
                                        ? null
                                        : newParent.item.getId(),
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
            className="flex flex-col items-start"
        >
            {tree.getItems().map((item) => (
                <div
                    key={item.getId()}
                    onContextMenu={(e) => {
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
                    }}
                >
                    {item.isFolder() && (
                        <button
                            onClick={
                                item.isExpanded() ? item.collapse : item.expand
                            }
                        >
                            {item.isExpanded() ? (
                                <ChevronDown />
                            ) : (
                                <ChevronRight />
                            )}
                        </button>
                    )}
                    <button
                        {...item.getProps()}
                        key={item.getId()}
                        style={{
                            paddingLeft: `${item.getItemMeta().level * 20}px`,
                        }}
                        onMouseDown={() => {
                            clickedNode.current = item.getId();
                        }}
                        onClick={(e) => {
                            // Handle dispatch
                            item.setFocused();

                            // Call the custom click behavior defined in the feature implementation
                            const modificationData = item
                                .getProps()
                                .onClick?.(e);
                            if (modificationData.selectedItems.length === 1) {
                                tree.setSelectedItems([
                                    item.getItemMeta().itemId,
                                ]);
                                dispatch(setSelectedResourceId(item.getId()));
                            } else {
                                tree.setSelectedItems(
                                    modificationData.selectedItems,
                                );
                                item.selectUpTo(e.ctrlKey || e.metaKey);
                                dispatch(
                                    setSelectedResourceId(
                                        modificationData.focusedItem,
                                    ),
                                );
                            }
                        }}
                    >
                        <div
                            className={`flex items-center gap-2 ${item.isDragTarget() ? "bg-amber-950" : ""}`}
                        >
                            {item.isFolder() ? <FolderIcon /> : <FileIcon />}
                            <div
                                className={`${item.isSelected() ? "font-bold" : ""}`}
                            >
                                {item.getItemName()}
                            </div>
                            {item.isSelected() && (
                                <div className="text-xs text-gray-500">
                                    (selected)
                                </div>
                            )}
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
                    console.log(
                        "Context menu action:",
                        action,
                        "on resource:",
                        resourceId,
                    );
                    // onResourceAction?.(action, resourceId);
                }}
            />
        </div>
    );
}
