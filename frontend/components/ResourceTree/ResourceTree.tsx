import {
    hotkeysCoreFeature,
    selectionFeature,
    syncDataLoaderFeature,
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

export default function ResourceTree({ projectId }: { projectId: string }) {
    const projectFromStore = useAppSelector((s) => selectProject(s, projectId));
    const projectFolders = projectFromStore?.folders || [];
    const projectFiles = projectFromStore?.resources || [];
    const allResources = [...projectFolders, ...projectFiles];
    const dataObject = transformResourcesToTreeData(
        allResources as AnyResource[],
    );
    console.log("Transformed data object from store:", dataObject);

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
        features: [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature],
    });

    return (
        <div
            {...tree.getContainerProps()}
            className="flex flex-col items-start"
        >
            {tree.getItems().map((item) => (
                <button
                    {...item.getProps()}
                    key={item.getId()}
                    style={{
                        paddingLeft: `${item.getItemMeta().level * 20}px`,
                    }}
                >
                    <div className="flex items-center gap-2">
                        {item.isFolder() ? <FolderIcon /> : <FileIcon />}
                        <div className={""}>{item.getItemName()}</div>
                    </div>
                </button>
            ))}
        </div>
    );
}
