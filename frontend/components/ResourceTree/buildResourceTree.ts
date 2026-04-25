import type { AnyResource, Folder } from "../../src/lib/models";

export const ROOT_ITEM_ID = "root";

// Folders use parentId (from FolderSchema); regular resources use folderId.
function getEffectiveParentId(resource: AnyResource): string | null | undefined {
    if (resource.type === "folder") {
        return (resource as Folder).parentId ?? resource.folderId;
    }
    return resource.folderId;
}

export interface ResourceItemData {
    name: string;
    children: string[];
    isFolder: boolean;
    parentId: string | null;
    special?: boolean;
    resourceId: string;
    orderIndex: number;
    resourceType: "text" | "image" | "audio" | "folder";
}

/**
 * Converts flat resources/folders into `@headless-tree` sync-loader data.
 */
export function buildResourceTree(
    resources: AnyResource[],
): Record<string, ResourceItemData> {
    const dataObject: Record<string, ResourceItemData> = {
        [ROOT_ITEM_ID]: {
            resourceId: ROOT_ITEM_ID,
            name: "Root",
            children: [],
            isFolder: true,
            parentId: null,
            orderIndex: 0,
            resourceType: "folder",
        },
    };

    function addResourceToDataObject(currentResource: AnyResource): void {
        const id = currentResource.id;
        const parentId = getEffectiveParentId(currentResource) || ROOT_ITEM_ID;

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
            resourceType: currentResource.type,
        };

        if (!dataObject[parentId]) {
            if (process.env.NODE_ENV !== "test") {
                console.warn(
                    `Parent resource with ID ${parentId} not found for resource with ID ${id}. Adding placeholder for parent.`,
                );
            }
            dataObject[parentId] = {
                resourceId: parentId,
                name: "Placeholder",
                children: [],
                isFolder: true,
                parentId: null,
                special: undefined,
                orderIndex: 0,
                resourceType: "folder",
            };
        }

        if (!dataObject[parentId].children.includes(id)) {
            dataObject[parentId].children.push(id);
        }

        if (currentResource.type === "folder") {
            const childResources = resources.filter(
                (resource) =>
                    getEffectiveParentId(resource) === currentResource.id,
            );
            childResources.forEach((childResource) => {
                addResourceToDataObject(childResource);
            });
        }
    }

    // Process root-level resources first. Folders recursively process their own
    // children, so all properly-parented items are handled in correct top-down
    // order without the warning firing for valid parent/child relationships.
    const rootResources = resources.filter((r) => !getEffectiveParentId(r));
    rootResources.forEach((resource) => {
        addResourceToDataObject(resource);
    });

    // Second pass: catch any resources whose parent folder was not in the tree
    // (genuinely orphaned — folderId set but parent not present in resources).
    // These will still trigger the warning, which is now a true positive.
    resources.forEach((resource) => {
        if (!dataObject[resource.id]) {
            addResourceToDataObject(resource);
        }
    });

    return dataObject;
}
