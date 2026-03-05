import {
    dragAndDropFeature,
    hotkeysCoreFeature,
    selectionFeature,
    syncDataLoaderFeature,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import { AnyResource } from "../../src/lib/models";
import { useState } from "react";

interface ResourceItemData {
    /** The name of the resource */
    name: string;
    /** The IDs of the resource's children */
    children: string[];
    /** Whether the resource is a folder */
    isFolder: boolean;
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
    console.log("Transformed data object:", dataObject);
    return dataObject;
}

const initialDataObject = transformResourcesToTreeData([
    {
        id: "folder-1",
        name: "Folder A",
        type: "folder",
        folderId: null,
        createdAt: "",
        updatedAt: "",
    },
    {
        id: "file-1",
        name: "File A1",
        type: "text",
        folderId: "folder-1",
        createdAt: "",
        updatedAt: "",
    },
    {
        id: "file-2",
        name: "File A2",
        type: "text",
        folderId: "folder-1",
        createdAt: "",
        updatedAt: "",
    },
    {
        id: "folder-2",
        name: "Folder B",
        type: "folder",
        folderId: null,
        createdAt: "",
        updatedAt: "",
    },
    {
        id: "file-3",
        name: "File B1",
        type: "text",
        folderId: "folder-2",
        createdAt: "",
        updatedAt: "",
    },
]);

export default function ResourceTree() {
    const tree = useTree<ResourceItemData>({
        rootItemId: "root",
        getItemName: (item) => {
            return item.getItemData().name;
        },
        isItemFolder: (item) => item.getItemData().isFolder,
        dataLoader: {
            getItem: (itemId) => initialDataObject[itemId],
            getChildren: (itemId) => {
                return initialDataObject[itemId].children;
            },
        },
        features: [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature],
    });

    return (
        <div {...tree.getContainerProps()} className="flex flex-col gap-1">
            {tree.getItems().map((item) => (
                <button
                    {...item.getProps()}
                    key={item.getId()}
                    style={{
                        paddingLeft: `${item.getItemMeta().level * 20}px`,
                    }}
                >
                    <div className={""}>{item.getItemName()}</div>
                </button>
            ))}
        </div>
    );
}
