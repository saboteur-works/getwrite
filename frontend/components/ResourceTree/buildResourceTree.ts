import type { AnyResource, Folder } from "../../src/lib/models";

export const ROOT_ITEM_ID = "root";

// Folders use parentId (from FolderSchema); regular resources use folderId.
function getEffectiveParentId(
  resource: AnyResource,
): string | null | undefined {
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

function addToTree(
  resource: AnyResource,
  tree: Record<string, ResourceItemData>,
  allResources: AnyResource[],
): void {
  const id = resource.id;
  let parentId = getEffectiveParentId(resource) || ROOT_ITEM_ID;

  tree[id] = {
    resourceId: id,
    name: resource.name,
    children: [],
    isFolder: resource.type === "folder",
    parentId,
    special:
      resource.type === "folder" && "special" in resource
        ? resource.special
        : undefined,
    orderIndex: resource.orderIndex || 0,
    resourceType: resource.type,
  };

  if (!tree[parentId] || !tree[parentId].isFolder) {
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        `Parent ${parentId} not found or is not a folder for resource ${id}. Moving to root.`,
      );
    }
    // Re-parent to root so the resource remains visible in the tree
    // and can be dragged to the correct folder by the user.
    tree[id].parentId = ROOT_ITEM_ID;
    parentId = ROOT_ITEM_ID;
  }

  if (!tree[parentId].children.includes(id)) {
    tree[parentId].children.push(id);
  }

  if (resource.type === "folder") {
    const children = allResources.filter(
      (r) => getEffectiveParentId(r) === resource.id,
    );
    children.forEach((child) => addToTree(child, tree, allResources));
  }
}

/**
 * Converts flat resources/folders into `@headless-tree` sync-loader data.
 */
export function buildResourceTree(
  resources: AnyResource[],
): Record<string, ResourceItemData> {
  const tree: Record<string, ResourceItemData> = {
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

  // Process root-level resources first. Folders recursively process their own
  // children, so all properly-parented items are handled in correct top-down
  // order without the warning firing for valid parent/child relationships.
  const rootResources = resources.filter((r) => !getEffectiveParentId(r));
  rootResources.forEach((r) => addToTree(r, tree, resources));

  // Second pass: catch any resources whose parent folder was not in the tree
  // (genuinely orphaned — folderId set but parent not present in resources).
  // These will still trigger the warning, which is now a true positive.
  resources.forEach((r) => {
    if (!tree[r.id]) addToTree(r, tree, resources);
  });

  return tree;
}
