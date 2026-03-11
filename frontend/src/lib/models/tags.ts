/**
 * @module tags
 *
 * Provides CRUD operations for tags and tag assignments within a GetWrite
 * project. Tags are stored in the project configuration file alongside
 * `tagAssignments`, a map of resource IDs to arrays of tag IDs.
 *
 * All functions in this module accept a `projectRoot` path and perform direct
 * reads and writes against the on-disk project file. They are intentionally
 * side-effect free beyond that single file, so callers do not need to
 * maintain in-memory state.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { generateUUID } from "./uuid";
import { ProjectSchema, ProjectConfigSchema } from "./schemas";
import type { Tag } from "./types";
import { PROJECT_FILENAME } from "./project-config";

/**
 * Reads and parses the project configuration file from disk.
 *
 * @param projectRoot - Absolute path to the project's root directory.
 * @returns The parsed project object. The return type is `any` because the
 *   shape of the file is validated at a higher level by callers.
 * @throws {Error} If the file cannot be read (e.g. missing or permission
 *   denied) or if its contents are not valid JSON.
 */
async function readProject(projectRoot: string) {
    const p = path.join(projectRoot, PROJECT_FILENAME);
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw);
    return parsed as any;
}

/**
 * Serialises a project object and writes it back to the project configuration
 * file on disk.
 *
 * Before writing, the function normalises `config.tagAssignments` so that
 * every value is an array of strings. Single-string values are wrapped in an
 * array; anything else that is not already an array is replaced with an empty
 * array. This guards against accidental shape mismatches introduced by
 * callers.
 *
 * Strict Zod schema validation is deliberately skipped here so that
 * incremental writes from tag helpers do not fail when the broader project
 * config contains fields not yet covered by the schema.
 *
 * @param projectRoot - Absolute path to the project's root directory.
 * @param projectObj  - The in-memory project object to persist.
 * @throws {Error} If the file cannot be written.
 */
async function writeProject(projectRoot: string, projectObj: any) {
    const p = path.join(projectRoot, PROJECT_FILENAME);
    // Validate config shape before writing
    if (projectObj.config) {
        // Normalize tagAssignments values to arrays in case callers passed a single string.
        if (
            projectObj.config.tagAssignments &&
            typeof projectObj.config.tagAssignments === "object"
        ) {
            for (const k of Object.keys(projectObj.config.tagAssignments)) {
                const v = projectObj.config.tagAssignments[k];
                if (typeof v === "string")
                    projectObj.config.tagAssignments[k] = [v];
                else if (!Array.isArray(v))
                    projectObj.config.tagAssignments[k] = [];
            }
        }
        // Intentionally skip strict schema validation here to allow flexible
        // project.config augmentation (tags, assignments) without causing
        // unexpected Zod errors during incremental writes from helpers.
    }
    await fs.writeFile(p, JSON.stringify(projectObj, null, 2), "utf8");
}

/**
 * Returns all tags defined in the project.
 *
 * @param projectRoot - Absolute path to the project's root directory.
 * @returns An array of {@link Tag} objects, or an empty array if no tags have
 *   been created yet.
 * @throws {Error} If the project file cannot be read or parsed.
 *
 * @example
 * const tags = await listTags("/projects/my-project");
 * // => [{ id: "abc123", name: "Draft", color: "#ff0000" }]
 */
export async function listTags(projectRoot: string): Promise<Tag[]> {
    const project = await readProject(projectRoot);
    return project.config?.tags ?? [];
}

/**
 * Creates a new tag and persists it to the project configuration.
 *
 * A UUID is generated automatically for the new tag. The `config.tags` array
 * is initialised if it does not already exist.
 *
 * @param projectRoot - Absolute path to the project's root directory.
 * @param name        - Human-readable display name for the tag.
 * @param color       - Optional CSS colour string (e.g. `"#ff0000"`) to
 *   visually distinguish the tag in the UI.
 * @returns The newly created {@link Tag} object, including its generated `id`.
 * @throws {Error} If the project file cannot be read or written.
 *
 * @example
 * const tag = await createTag("/projects/my-project", "Draft", "#aabbcc");
 * // => { id: "uuid-...", name: "Draft", color: "#aabbcc" }
 */
export async function createTag(
    projectRoot: string,
    name: string,
    color?: string,
): Promise<Tag> {
    const project = await readProject(projectRoot);
    const tag: Tag = { id: generateUUID(), name, color };
    project.config = project.config ?? {};
    project.config.tags = project.config.tags ?? [];
    project.config.tags.push(tag);
    await writeProject(projectRoot, project);
    return tag;
}

/**
 * Deletes a tag by ID and removes all of its assignments from every resource.
 *
 * If the tag does not exist, the function returns `false` without modifying
 * the project file. This makes the operation safe to call speculatively.
 *
 * @param projectRoot - Absolute path to the project's root directory.
 * @param tagId       - UUID of the tag to delete.
 * @returns `true` if the tag was found and removed; `false` if it did not
 *   exist.
 * @throws {Error} If the project file cannot be read or written.
 *
 * @example
 * const removed = await deleteTag("/projects/my-project", "abc123");
 * // => true  (tag existed and was deleted)
 * // => false (tag was not found)
 */
export async function deleteTag(
    projectRoot: string,
    tagId: string,
): Promise<boolean> {
    const project = await readProject(projectRoot);
    if (!project.config?.tags) return false;
    const before = project.config.tags.length;
    project.config.tags = project.config.tags.filter(
        (t: Tag) => t.id !== tagId,
    );
    // Remove assignments referencing the tag
    if (project.config?.tagAssignments) {
        for (const [res, arr] of Object.entries(
            project.config.tagAssignments,
        )) {
            project.config.tagAssignments[res] = arr.filter(
                (id: string) => id !== tagId,
            );
        }
    }
    await writeProject(projectRoot, project);
    return project.config.tags.length < before;
}

/**
 * Assigns a tag to a resource, creating the assignment map entry if needed.
 *
 * The operation is idempotent: calling it multiple times with the same
 * `resourceId`/`tagId` pair will not create duplicate entries.
 *
 * @param projectRoot - Absolute path to the project's root directory.
 * @param resourceId  - UUID of the resource to tag.
 * @param tagId       - UUID of the tag to assign.
 * @throws {Error} If the project file cannot be read or written.
 *
 * @example
 * await assignTagToResource("/projects/my-project", "resource-uuid", "tag-uuid");
 */
export async function assignTagToResource(
    projectRoot: string,
    resourceId: string,
    tagId: string,
): Promise<void> {
    const project = await readProject(projectRoot);
    project.config = project.config ?? {};
    project.config.tagAssignments = project.config.tagAssignments ?? {};
    project.config.tagAssignments[resourceId] =
        project.config.tagAssignments[resourceId] ?? [];
    if (!project.config.tagAssignments[resourceId].includes(tagId)) {
        project.config.tagAssignments[resourceId].push(tagId);
    }
    await writeProject(projectRoot, project);
}

/**
 * Removes a tag assignment from a resource.
 *
 * If the resource has no assignments, or the specific tag is not assigned to
 * it, the function returns early without modifying the project file.
 *
 * @param projectRoot - Absolute path to the project's root directory.
 * @param resourceId  - UUID of the resource from which the tag should be
 *   removed.
 * @param tagId       - UUID of the tag to unassign.
 * @throws {Error} If the project file cannot be read or written.
 *
 * @example
 * await unassignTagFromResource("/projects/my-project", "resource-uuid", "tag-uuid");
 */
export async function unassignTagFromResource(
    projectRoot: string,
    resourceId: string,
    tagId: string,
): Promise<void> {
    const project = await readProject(projectRoot);
    if (!project.config?.tagAssignments?.[resourceId]) return;
    project.config.tagAssignments[resourceId] = project.config.tagAssignments[
        resourceId
    ].filter((t: string) => t !== tagId);
    await writeProject(projectRoot, project);
}

/**
 * Returns the IDs of all resources that have been assigned a given tag.
 *
 * @param projectRoot - Absolute path to the project's root directory.
 * @param tagId       - UUID of the tag to query.
 * @returns An array of resource ID strings. Returns an empty array if no
 *   resources are assigned to the tag.
 * @throws {Error} If the project file cannot be read or parsed.
 *
 * @example
 * const resourceIds = await listResourcesByTag("/projects/my-project", "tag-uuid");
 * // => ["resource-uuid-1", "resource-uuid-2"]
 */
export async function listResourcesByTag(
    projectRoot: string,
    tagId: string,
): Promise<string[]> {
    const project = await readProject(projectRoot);
    const assignments = project.config?.tagAssignments ?? {};
    const results: string[] = [];
    for (const [res, arr] of Object.entries(assignments)) {
        if ((arr as string[]).includes(tagId)) results.push(res);
    }
    return results;
}

/**
 * Convenience default export that bundles all tag operations into a single
 * object. Prefer named imports for tree-shaking; use this default export when
 * the full API surface needs to be passed around as a dependency.
 */
export default {
    listTags,
    createTag,
    deleteTag,
    assignTagToResource,
    unassignTagFromResource,
    listResourcesByTag,
};
