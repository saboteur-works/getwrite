import {
    hotkeysCoreFeature,
    selectionFeature,
    syncDataLoaderFeature,
    dragAndDropFeature,
    FeatureImplementation,
    ItemInstance,
    createOnDropHandler,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import { AnyResource, Folder } from "../../src/lib/models";
import useAppSelector, { useAppDispatch } from "../../src/store/hooks";
import {
    persistReorder,
    selectFoldersAndResources,
    setSelectedResourceId,
    updateFolders,
    updateResources,
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
import { uniq } from "lodash";

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
    resourceId: string;
    orderIndex: number;
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
            resourceId: "root",
            name: "Root",
            children: [],
            isFolder: true,
            parentId: null,
            orderIndex: 0,
        },
    };

    function addResourceToDataObject(currentResource: AnyResource) {
        // Create the basic structure for the resource and add it to the data object
        const id = currentResource.id;
        const parentId = currentResource.folderId || "root";
        dataObject[id] = {
            resourceId: id,
            name: currentResource.name,
            children: [],
            isFolder: currentResource.type === "folder",
            parentId,
            special:
                currentResource.type === "folder" &&
                "special" in currentResource
                    ? currentResource.special
                    : undefined,
            orderIndex: currentResource.orderIndex || 0,
        };

        // Check if the parent resource is already in the data object; if not, add a placeholder for it (this can happen if a child resource is processed before its parent)
        if (!dataObject[parentId]) {
            console.warn(
                `Parent resource with ID ${parentId} not found for resource with ID ${id}. Adding placeholder for parent.`,
            );
            dataObject[parentId] = {
                resourceId: parentId,
                name: "Placeholder",
                children: [],
                isFolder: true,
                parentId: null,
                special: undefined,
                orderIndex: 0,
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
                return transformedResourceData[itemId].children.sort((a, b) => {
                    const aData = transformedResourceData[a];
                    const bData = transformedResourceData[b];

                    return (
                        (transformedResourceData[aData.resourceId]
                            ?.orderIndex || 0) -
                        (transformedResourceData[bData.resourceId]
                            ?.orderIndex || 0)
                    );
                });
            },
        },
        indent: INDENTATION_WIDTH,
        onPrimaryAction: (item) => {
            dispatch(setSelectedResourceId(item.getId()));
        },
        onDrop: createOnDropHandler((item, newChildren) => {
            console.log(
                "Dropped item:",
                item.getItemData(),
                "New children:",
                newChildren,
            );
            transformedResourceData[item.getId()].children = newChildren;
            const updateData = uniq(newChildren).reduce(
                (prev, childId) => {
                    const chilData = rawResources.find((r) => r.id === childId);
                    if (!chilData) {
                        console.error(
                            `Resource with ID ${childId} not found in raw resources.`,
                        );
                        return prev;
                    }
                    if (chilData.type === "folder") {
                        prev.folderOrder.push({
                            id: childId,
                            orderIndex: prev.folderOrder.length,
                            folderId:
                                item.getId() === ROOT_ITEM_ID
                                    ? null
                                    : item.getId(),
                        } as Partial<AnyResource & { id: string }>);
                        transformedResourceData[childId].orderIndex =
                            prev.folderOrder.length - 1;
                    } else {
                        prev.resourceOrder.push({
                            id: childId,
                            orderIndex: prev.resourceOrder.length,
                            folderId:
                                item.getId() === ROOT_ITEM_ID
                                    ? null
                                    : item.getId(),
                        } as Partial<AnyResource & { id: string }>);
                        transformedResourceData[childId].orderIndex =
                            prev.resourceOrder.length - 1;
                    }
                    return prev;
                },
                {
                    folderOrder: [] as Partial<AnyResource & { id: string }>[],
                    resourceOrder: [] as Partial<
                        AnyResource & { id: string }
                    >[],
                },
            );
            console.log("Update data:", {
                folders: updateData.folderOrder.map(
                    (f) => transformedResourceData[f.id as string].name,
                ),
                resources: updateData.resourceOrder.map(
                    (r) => transformedResourceData[r.id as string].name,
                ),
            });

            if (updateData.folderOrder.length > 0) {
                dispatch(updateFolders(updateData.folderOrder));
            }
            if (updateData.resourceOrder.length > 0) {
                dispatch(updateResources(updateData.resourceOrder));
            }

            dispatch(
                persistReorder({
                    projectId: currentProject.id,
                    projectRoot: currentProject.rootPath,
                    folderOrder: updateData.folderOrder,
                    resourceOrder: updateData.resourceOrder,
                }),
            );
        }),
        setDragImage: () => ({
            imgElement: document.getElementById("dragpreview")!,
            xOffset: -40,
            yOffset: -40,
        }),
        canReorder: true,
        features: [
            syncDataLoaderFeature,
            selectionFeature,
            hotkeysCoreFeature,
            customClickBehavior,
            dragAndDropFeature,
        ],
    });
    const draggedItems = tree.getState().dnd?.draggedItems;
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
                    className="hover:bg-gray-300 w-full flex rounded-sm"
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
                        className="hover:cursor-pointer hover:text-stone-600 w-full"
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
            <div
                id="dragpreview"
                style={{
                    // move the drag preview off-screen by default
                    position: "absolute",
                    left: "-9999px",
                }}
                className="bg-white border p-0.5 px-2 rounded-sm opacity-65"
            >
                {draggedItems
                    ?.slice(0, 3)
                    .map((item) => item.getItemName())
                    .join(", ")}
                {(draggedItems?.length ?? 0) > 3 &&
                    ` and ${(draggedItems?.length ?? 0) - 3} more`}
            </div>
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
