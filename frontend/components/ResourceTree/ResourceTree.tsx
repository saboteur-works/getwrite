// Last Updated: 2026-03-11

/**
 * @module ResourceTree
 *
 * Renders the project's resource hierarchy as a drag-and-drop file/folder tree.
 *
 * The component reads all folders and resources from the Redux `resourcesSlice`,
 * transforms them into the flat-keyed map expected by `@headless-tree`, and
 * delegates rendering and interaction to `useTree`.  Drop events are translated
 * back into Redux dispatches so that in-memory state and on-disk order are kept
 * in sync via `persistReorder`.
 *
 * Features enabled on the tree:
 * - `syncDataLoaderFeature` — synchronous item/children loading
 * - `selectionFeature`     — single and multi-select with Shift/Ctrl
 * - `hotkeysCoreFeature`   — keyboard navigation
 * - `dragAndDropFeature`   — drag-to-reorder and drag-to-reparent
 * - `customClickBehavior`  — local override that mirrors selection state to Redux
 *
 * @example
 * ```tsx
 * <ResourceTree
 *   onResourceAction={(action, resourceId) => {
 *     if (action === "delete") handleDelete(resourceId);
 *   }}
 * />
 * ```
 */
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

/** Horizontal pixel offset applied per nesting level when rendering tree items. */
const INDENTATION_WIDTH = 20;

/**
 * Sentinel identifier for the virtual root node that owns all top-level
 * resources (those whose `folderId` is `null`).
 */
const ROOT_ITEM_ID = "root";

/**
 * Shape of the data payload attached to every node in the `@headless-tree`
 * instance.  The tree itself is generic over this type, so all item-level
 * helpers (e.g. `item.getItemData()`) return `ResourceItemData`.
 */
interface ResourceItemData {
    /** The display name of the resource or folder. */
    name: string;
    /** Ordered IDs of direct child nodes.  Empty for leaf resources. */
    children: string[];
    /** `true` when this node represents a `Folder` rather than a text resource. */
    isFolder: boolean;
    /** ID of the immediate parent folder, or `null` for top-level nodes. */
    parentId: string | null;
    /**
     * When `true` the folder is treated as a "special" system folder that
     * cannot be freely reparented by the user.
     */
    special?: boolean;
    /** The stable resource ID that corresponds to the entry in the Redux store. */
    resourceId: string;
    /** Zero-based index that controls sibling sort order within a parent. */
    orderIndex: number;
}

/**
 * A `@headless-tree` feature plug-in that overrides the default click handler
 * so that:
 * - **Shift+click** extends the selection contiguously via `selectUpTo`.
 * - **Ctrl/Cmd+click** toggles individual items with `toggleSelect`.
 * - **Plain click** replaces the entire selection with the clicked item.
 *
 * The handler also focuses the clicked item and forwards the original event to
 * any previously registered `onClick` prop so that upstream features still
 * receive their callbacks.
 */
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
 * Converts a flat array of `AnyResource` entries into a keyed map that the
 * `@headless-tree` synchronous data loader can consume.
 *
 * Each resource becomes an entry in the returned record keyed by its `id`.
 * A virtual `"root"` entry is always present and owns all top-level resources
 * (those whose `folderId` is `null` or absent).
 *
 * The transformation is recursive for folders: when a folder is encountered,
 * its children are immediately added to the map so that child references in
 * `children` arrays are always resolvable.  If a parent is referenced before
 * it has been processed, a placeholder node is inserted and a warning is
 * emitted to the console.
 *
 * @param resources - Flat list of all project resources (folders and files).
 * @returns A record mapping each resource ID (plus `"root"`) to its
 *   `ResourceItemData` descriptor.
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

    /**
     * Recursively upserts `currentResource` — and all of its folder descendants
     * — into `dataObject`, and registers the resource's ID in its parent's
     * `children` array.
     *
     * @param currentResource - The resource to insert.
     */
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

/**
 * Props accepted by the {@link ResourceTree} component.
 */
interface ResourceTreeProps {
    /**
     * Called when the user selects a context-menu action on a resource.
     *
     * @param action     - The action that was chosen (e.g. `"rename"`, `"delete"`).
     * @param resourceId - ID of the resource the action targets, if applicable.
     */
    onResourceAction?: (
        action: ResourceContextAction,
        resourceId?: string,
    ) => void;
    /**
     * When `true`, enables additional debug logging inside the component.
     * Intended for development use only.
     */
    debug?: boolean;
}

/**
 * Renders the full resource tree for the active project.
 *
 * Reads folders and resources from the Redux store, transforms them into the
 * `@headless-tree` data format, and mounts a keyboard- and mouse-accessible
 * tree with drag-and-drop reordering support.  Drop events are dispatched back
 * to the store and persisted to disk via `persistReorder`.
 *
 * @param props - See {@link ResourceTreeProps}.
 */
export default function ResourceTree({
    onResourceAction,
    debug,
}: ResourceTreeProps) {
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

    /**
     * Handles a primary (left) click on a tree item.
     *
     * Delegates to the `customClickBehavior` feature to determine the new
     * selection set, then mirrors the result to the Redux store via
     * `setSelectedResourceId` so that the rest of the app reacts to the change.
     *
     * @param e    - The originating mouse event.
     * @param item - The `@headless-tree` item instance that was clicked.
     */
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

    /**
     * Opens the context menu for a tree item at the cursor position.
     *
     * Prevents the browser's native context menu, captures the pointer
     * coordinates, and stores them together with the target resource's ID and
     * name in local state so that `ResourceContextMenu` can render at the
     * correct location.
     *
     * @param e    - The originating mouse event (right-click or context-menu key).
     * @param item - The `@headless-tree` item instance the menu was invoked on.
     */
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

    /**
     * Returns the appropriate icon element for a tree node.
     *
     * Folders receive a `FolderIcon`; all other resources receive a `FileIcon`.
     *
     * @param item - The tree item to render an icon for.
     * @returns A React icon element.
     */
    const renderResourceIcon = (item: ItemInstance<ResourceItemData>) => {
        return item.isFolder() ? <FolderIcon /> : <FileIcon />;
    };

    /**
     * Returns the expand/collapse chevron icon for a folder node.
     *
     * Renders `ChevronDown` when the folder is expanded and `ChevronRight`
     * when it is collapsed, giving the user a visual affordance for the
     * current state.
     *
     * @param item - The folder item to render an expander icon for.
     * @returns A React icon element representing the collapsed/expanded state.
     */
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
        /**
         * Handles a completed drag-and-drop operation.
         *
         * `createOnDropHandler` provides the drop target `item` and its
         * recomputed `newChildren` array after the drop.  This handler:
         * 1. Updates the in-memory `transformedResourceData` so the tree
         *    reflects the new order immediately without waiting for a Redux
         *    round-trip.
         * 2. Separates the dropped children into folders and leaf resources
         *    and assigns new `orderIndex` values (0-based within each group).
         * 3. Dispatches `updateFolders` / `updateResources` to update the
         *    Redux slice.
         * 4. Dispatches `persistReorder` to write the updated order to disk.
         */
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
                        } as Partial<Folder> & { id: string });
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
                        } as Partial<AnyResource> & { id: string });
                        transformedResourceData[childId].orderIndex =
                            prev.resourceOrder.length - 1;
                    }
                    return prev;
                },
                {
                    folderOrder: [] as (Partial<Folder> & { id: string })[],
                    resourceOrder: [] as (Partial<AnyResource> & {
                        id: string;
                    })[],
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
            aria-label="Resource tree"
            className="flex flex-col items-start mb-8"
        >
            {tree.getItems().map((item) => (
                <div
                    key={item.getId()}
                    style={{
                        paddingLeft: `${item.getItemMeta().level * 20}px`,
                    }}
                    className="resource-tree-item"
                    onContextMenu={(e) => {
                        handleContextMenu(e, item);
                    }}
                >
                    {item.isFolder() && (
                        <button
                            className="resource-tree-icon-button"
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
                        className="resource-tree-button"
                    >
                        <div
                            className={`resource-tree-item-row ${item.isDragTarget() ? "resource-tree-item-row--drag-target" : ""}`}
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
                className="resource-tree-drag-preview"
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
