import adapter from "../src/lib/adapters/placeholderAdapter";
import type {
    Project as CanonicalProject,
    AnyResource,
    Folder,
} from "../src/lib/models/types";
import type { ResourceType } from "./types";

/**
 * Create a short, random id with an optional prefix for placeholder data.
 * @deprecated
 * */
function genId(prefix = "id"): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Return the current time as an ISO string for createdAt/updatedAt fields.
 * @deprecated
 * */
function nowIso(): string {
    return new Date().toISOString();
}

/**
 * Create a placeholder `Resource` object for UI development.
 * @deprecated
 * @param title Human readable title shown in lists.
 * @param type ResourceType controlling icon/behavior.
 * @param projectId Optional project id — generated if omitted.
 * @param parentId Optional parent resource id for nested trees.
 * @returns A fully-formed `Resource` suitable for rendering in the tree and work area.
 */
export function createResource(
    title: string,
    type: ResourceType = "document",
    projectId?: string,
    parentId?: string,
    resourceIndex?: number,
): AnyResource {
    let id: string;
    if (projectId && typeof resourceIndex === "number") {
        const slug = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
        id = `${projectId}_res_${resourceIndex}_${slug}`;
    } else {
        id = genId("res");
    }
    const pid = projectId ?? genId("proj");
    const createdAt = nowIso();
    const metadata: Record<string, unknown> = {
        status: "draft",
        characters: [],
        locations: [],
        items: [],
        pov: null,
        wordCount: 0,
        notes: "",
    };

    const legacy = {
        id,
        projectId: pid,
        parentId,
        title,
        type,
        content: `Placeholder content for ${title}`,
        createdAt,
        updatedAt: createdAt,
        metadata,
    };
    return adapter.migrateResource(legacy);
}

/**
 * Create a lightweight placeholder `Project` containing a few sample `Resource`s.
 * Used to populate lists in StartPage and Storybook.
 * @deprecated
 * @param name Friendly name for the project.
 * @returns `Project` with createdAt/updatedAt and `resources` array.
 */
export function createProject(
    name = "Untitled Project",
    id?: string,
): { project: CanonicalProject; resources: AnyResource[]; folders: Folder[] } {
    const pid = id ?? genId("proj");
    const createdAt = nowIso();

    // Build legacy-shaped resources (plain objects) so the adapter can migrate them
    const rootLegacy = {
        id: genId("res"),
        projectId: pid,
        parentId: undefined,
        title: name,
        type: "folder",
        content: null,
        createdAt,
        updatedAt: createdAt,
        metadata: {},
    };
    const workspaceLegacy = {
        id: genId("res"),
        projectId: pid,
        parentId: rootLegacy.id,
        title: "Workspace",
        type: "folder",
        content: null,
        createdAt,
        updatedAt: createdAt,
        metadata: {},
    };
    const chapter1Legacy = {
        id: genId("res"),
        projectId: pid,
        parentId: workspaceLegacy.id,
        title: "Chapter 1",
        type: "folder",
        content: null,
        createdAt,
        updatedAt: createdAt,
        metadata: {},
    };
    const sceneALegacy = {
        id: genId("res"),
        projectId: pid,
        parentId: chapter1Legacy.id,
        title: "Scene A",
        type: "scene",
        content: `Placeholder content for Scene A`,
        createdAt,
        updatedAt: createdAt,
        metadata: {},
    };
    const notesLegacy = {
        id: genId("res"),
        projectId: pid,
        parentId: rootLegacy.id,
        title: "Notes",
        type: "note",
        content: `Notes for ${name}`,
        createdAt,
        updatedAt: createdAt,
        metadata: {},
    };

    const legacyProject = {
        id: pid,
        title: name,
        description: "Placeholder project created for UI development",
        createdAt,
        updatedAt: createdAt,
        resources: [
            rootLegacy,
            workspaceLegacy,
            chapter1Legacy,
            sceneALegacy,
            notesLegacy,
        ],
        folders: [],
    };

    const migrated = adapter.migrateProject(legacyProject);
    return migrated;
}

/**
 * Produce an array of placeholder `Project`s for list views.
 * @deprecated
 * @param count Number of sample projects to produce.
 */
export function sampleProjects(count = 2) {
    const out: Array<{
        project: CanonicalProject;
        resources: AnyResource[];
        folders: Folder[];
    }> = [];
    for (let i = 1; i <= count; i += 1) {
        out.push(createProject(`Sample Project ${i}`, `proj_${i}`));
    }
    return out;
}

/**
 * Utility to locate a project by id from an in-memory array.
 * Returns `undefined` when not found; UI callers should handle that case.
 * @deprecated
 */
export function findProjectById(
    projects: Array<{
        project: CanonicalProject;
        resources: AnyResource[];
        folders: Folder[];
    }>,
    id: string,
):
    | { project: CanonicalProject; resources: AnyResource[]; folders: Folder[] }
    | undefined {
    return projects.find((p) => p.project.id === id);
}
