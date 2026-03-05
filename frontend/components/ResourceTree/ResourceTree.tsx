import {
    hotkeysCoreFeature,
    selectionFeature,
    syncDataLoaderFeature,
    FeatureImplementation,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import { AnyResource } from "../../src/lib/models";
import useAppSelector from "../../src/store/hooks";
import { selectProject } from "../../src/store/projectsSlice";

interface ResourceItemData {
    /** The name of the resource */
    name: string;
    /** The IDs of the resource's children */
    children: string[];
    /** Whether the resource is a folder */
    isFolder: boolean;
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
        };

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
    projectId,
    debug,
}: {
    projectId: string;
    debug?: boolean;
}) {
    const projectFromStore = useAppSelector((s) => selectProject(s, projectId));
    const projectFolders = projectFromStore?.folders || [];
    const projectFiles = projectFromStore?.resources || [];
    const allResources = [...projectFolders, ...projectFiles];
    const dataObject = transformResourcesToTreeData(
        allResources as AnyResource[],
    );

    const tree = useTree<ResourceItemData>({
        rootItemId: "root",
        getItemName: (item) => {
            return item.getItemData().name;
        },
        isItemFolder: (item) => item.getItemData().isFolder,
        dataLoader: {
            getItem: (itemId) => dataObject[itemId],
            getChildren: (itemId) => {
                return dataObject[itemId].children;
            },
        },
        onPrimaryAction: (item) => {
            console.log("Primary action on item:", item.getItemData().name);
        },
        features: [
            syncDataLoaderFeature,
            selectionFeature,
            hotkeysCoreFeature,
            customClickBehavior,
        ],
    });

    return (
        <div
            {...tree.getContainerProps()}
            className="flex flex-col items-start"
        >
            {tree.getItems().map((item) => (
                <div key={item.getId()}>
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
                        onClick={(e) => {
                            // Call the custom click behavior defined in the feature implementation
                            item.getProps().onClick?.(e);
                            // Do further handling if needed
                        }}
                    >
                        <div className="flex items-center gap-2">
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
        </div>
    );
}
