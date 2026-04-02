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
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import { AnyResource } from "../../src/lib/models";
import useAppSelector, { useAppDispatch } from "../../src/store/hooks";
import {
    selectFoldersAndResources,
    setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import ResourceContextMenu, {
    ResourceContextAction,
} from "./ResourceContextMenu";
import { useState, useRef, useMemo, useEffect } from "react";
import { shallowEqual } from "react-redux";
import {
    ChevronDown,
    ChevronRight,
    FileTextIcon,
    ImageIcon,
    AudioIcon,
    FolderIcon,
} from "./ResourceTreeIcons";
import {
    buildResourceTree,
    ResourceItemData,
    ROOT_ITEM_ID,
} from "./buildResourceTree";
import { useResourceReorder } from "./useResourceReorder";

/** Horizontal pixel offset applied per nesting level when rendering tree items. */
const INDENTATION_WIDTH = 20;

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

    const transformedResourceData = useMemo(() => {
        return buildResourceTree(rawResources);
    }, [rawResources]);

    const onDrop = useResourceReorder({
        dispatch,
        currentProject,
        rawResources,
        transformedResourceData,
        rootItemId: ROOT_ITEM_ID,
    });

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
     * Returns the appropriate icon element for a tree node based on resource type.
     *
     * - Folders receive a `FolderIcon`
     * - Text resources receive a `FileTextIcon`
     * - Image resources receive an `ImageIcon`
     * - Audio resources receive an `AudioIcon`
     *
     * @param item - The tree item to render an icon for.
     * @returns A React icon element matching the resource type.
     */
    const renderResourceIcon = (item: ItemInstance<ResourceItemData>) => {
        const resourceType = item.getItemData().resourceType;

        switch (resourceType) {
            case "folder":
                return <FolderIcon />;
            case "text":
                return <FileTextIcon />;
            case "image":
                return <ImageIcon />;
            case "audio":
                return <AudioIcon />;
            default:
                return <FileTextIcon />;
        }
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
        onDrop,
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
    useEffect(() => {
        tree.rebuildTree();
    }, [transformedResourceData]);

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
