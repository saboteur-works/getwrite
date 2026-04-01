import type {
    Folder as FolderType,
    MetadataValue,
    Project as ProjectType,
    TextResource,
} from "./types";

/**
 * Minimal UI Resource shape expected by legacy UI components (adapter output).
 * We keep this local to the adapter to avoid changing legacy UI types.
 */
export interface UIResource {
    id: string;
    projectId: string;
    parentId?: string | null;
    title: string;
    type: string;
    content?: string;
    createdAt: string;
    updatedAt?: string;
    userMetadata?: Record<string, MetadataValue>;
    _orderIndex?: number;
}

export interface FolderWithResources extends FolderType {
    resources: UIResource[];
}

export interface BuildProjectViewOptions {
    project: ProjectType;
    folders: FolderType[];
    resources: TextResource[];
}

function getOrderIndex(
    metadata: Record<string, MetadataValue> | undefined,
    fallback: number,
): number {
    const rawOrder = metadata?.orderIndex;
    return typeof rawOrder === "number" ? rawOrder : fallback;
}

function toUIResource(
    resource: TextResource,
    projectId: string,
    fallbackOrderIndex: number,
): UIResource {
    return {
        id: resource.id,
        projectId,
        parentId: undefined,
        title: resource.name,
        type: resource.type,
        content: resource.plainText,
        createdAt: resource.createdAt,
        updatedAt: resource.updatedAt,
        userMetadata: resource.userMetadata,
        _orderIndex: getOrderIndex(resource.userMetadata, fallbackOrderIndex),
    };
}

function toFolderEntry(folder: FolderType, projectId: string): UIResource {
    return {
        id: folder.id,
        projectId,
        parentId: undefined,
        title: folder.name,
        type: "folder",
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
        userMetadata: {},
        _orderIndex: folder.orderIndex ?? 0,
    };
}

/**
 * Build a UI-friendly project view from canonical `project`, `folders`, and
 * `resources` produced by the scaffolder. This adapter sorts folders by
 * `orderIndex` and resources per-folder by `userMetadata.orderIndex` (fallback to
 * source iteration order).
 */
export function buildProjectViewAdapter(options: BuildProjectViewOptions): {
    project: ProjectType;
    folders: FolderWithResources[];
    resources: UIResource[];
} {
    const { project, folders, resources } = options;

    const folderMap = new Map<string, FolderWithResources>();
    for (const folder of folders) {
        folderMap.set(folder.id, { ...folder, resources: [] });
    }

    resources.forEach((resource, index) => {
        const uiResource = toUIResource(resource, project.id, index);
        const targetFolder = folderMap.get(resource.folderId ?? "") ?? null;
        if (targetFolder) {
            targetFolder.resources.push(uiResource);
        }
    });

    const sortedFolders = Array.from(folderMap.values()).sort(
        (left, right) => (left.orderIndex ?? 0) - (right.orderIndex ?? 0),
    );

    for (const folder of sortedFolders) {
        folder.resources.sort(
            (left, right) => (left._orderIndex ?? 0) - (right._orderIndex ?? 0),
        );
    }

    const flatResources: UIResource[] = [];
    for (const folder of sortedFolders) {
        flatResources.push(toFolderEntry(folder, project.id));
        flatResources.push(...folder.resources);
    }

    return {
        project,
        folders: sortedFolders,
        resources: flatResources,
    };
}
