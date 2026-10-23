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
import { readFile } from "./io";
import { updateProjectJson } from "./project-json-write";
import path from "node:path";
import { generateUUID } from "./uuid";
import type { Project, Tag } from "./types";
import { PROJECT_FILENAME } from "./project-config";

/**
 * Reads and parses the project configuration file from disk.
 *
 * @param projectRoot - Absolute path to the project's root directory.
 * @returns The parsed {@link Project} object.
 * @throws {Error} If the file cannot be read (e.g. missing or permission
 *   denied) or if its contents are not valid JSON.
 */
async function readProject(projectRoot: string): Promise<Project> {
  const projectPath = path.join(projectRoot, PROJECT_FILENAME);
  const raw = await readFile(projectPath, "utf8");
  // JSON.parse returns `any`; we cast to Project here because strict Zod
  // validation is intentionally deferred to higher-level callers.
  return JSON.parse(raw) as Project;
}

/**
 * Normalises `config.tagAssignments` before a write so that every value is an
 * array of strings. Single-string values are wrapped in an array; anything
 * else that is not already an array is replaced with an empty array. This
 * guards against shapes left by an older code version.
 *
 * Strict Zod schema validation is deliberately skipped so that incremental
 * writes from tag helpers do not fail when the broader project config holds
 * fields not yet covered by the schema.
 */
function normalizeTagAssignments(projectObj: Project): void {
  if (projectObj.config?.tagAssignments) {
    const rawAssignments = projectObj.config.tagAssignments as Record<
      string,
      unknown
    >;
    for (const [resourceId, value] of Object.entries(rawAssignments)) {
      if (typeof value === "string") {
        projectObj.config.tagAssignments[resourceId] = [value];
      } else if (!Array.isArray(value)) {
        projectObj.config.tagAssignments[resourceId] = [];
      }
    }
  }
}

/**
 * One tag change as a single locked, atomic read-modify-write of
 * `project.json` (see `project-json-write.ts`). The check a change makes (a
 * duplicate name, a missing tag) reads the same project it writes.
 */
function addTag(project: Project, name: string, color?: string): Tag {
  const tag: Tag = { id: generateUUID(), name, color };
  const config = project.config ?? { editorConfig: {} };
  config.tags = config.tags ?? [];
  config.tags.push(tag);
  project.config = config;
  return tag;
}

function mutateTags<T>(
  projectRoot: string,
  mutate: (project: Project) => { result: T; shouldWrite?: boolean },
): Promise<T> {
  return updateProjectJson(projectRoot, (project) => {
    const outcome = mutate(project);
    if (outcome.shouldWrite !== false) normalizeTagAssignments(project);
    return outcome;
  });
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
  return mutateTags(projectRoot, (project) => ({
    result: addTag(project, name, color),
  }));
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
  return mutateTags(projectRoot, (project) => {
    if (!project.config?.tags) return { result: false, shouldWrite: false };
    const countBefore = project.config.tags.length;
    project.config.tags = project.config.tags.filter(
      (t: Tag) => t.id !== tagId,
    );
    // Remove assignments referencing the tag
    if (project.config?.tagAssignments) {
      for (const [resourceId, tagIds] of Object.entries(
        project.config.tagAssignments,
      )) {
        project.config.tagAssignments[resourceId] = tagIds.filter(
          (id) => id !== tagId,
        );
      }
    }
    return { result: project.config.tags.length < countBefore };
  });
}

/** Thrown by {@link updateTag} when no tag has the given id. */
export class TagNotFoundError extends Error {
  constructor(tagId: string) {
    super(`Tag not found: "${tagId}"`);
    this.name = "TagNotFoundError";
  }
}

/**
 * Thrown by {@link createCheckedTag} and {@link updateTag} when the requested
 * name or colour is refused.
 * The message is written for the writer and is safe to show as-is.
 */
export class TagRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TagRefusedError";
  }
}

/** The editable fields of a tag. An absent `color` means no colour. */
export interface TagChanges {
  name: string;
  color?: string;
}

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Applies the writer-facing rules to a tag's fields: the name is trimmed and
 * must not be blank or match another tag's name (trimmed, ignoring capitals);
 * a colour must be a `#rgb` or `#rrggbb` hex string. `exceptTagId` is the tag
 * being edited, which may keep its own name.
 *
 * @returns The trimmed name and colour to store.
 * @throws {TagRefusedError} If the name or colour is refused.
 */
function checkTagFields(
  tags: Tag[],
  changes: TagChanges,
  exceptTagId?: string,
): TagChanges {
  const name = changes.name.trim();
  if (name === "") {
    throw new TagRefusedError("Tag name must not be blank.");
  }
  const clash = tags.find(
    (t) =>
      t.id !== exceptTagId &&
      t.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (clash) {
    throw new TagRefusedError(
      `A tag named \u201c${clash.name.trim()}\u201d already exists.`,
    );
  }
  const color = changes.color?.trim();
  if (color !== undefined && !HEX_COLOR.test(color)) {
    throw new TagRefusedError(
      "Tag color must be a hex color such as #3366cc.", // GW-HEX-EXEMPT: example in a writer-facing message, not a style
    );
  }
  return color ? { name, color } : { name };
}

/**
 * Creates a tag from the writer's input, applying the same rules as
 * {@link updateTag}: the name is trimmed and must not be blank or match an
 * existing tag's name (ignoring capitals), and a colour must be hex.
 *
 * {@link createTag} stays unchecked: Scrivener import calls it with keyword
 * names, which may differ only in capitals.
 *
 * @throws {TagRefusedError} If the name or colour is refused.
 * @throws {Error} If the project file cannot be read or written.
 */
export async function createCheckedTag(
  projectRoot: string,
  changes: TagChanges,
): Promise<Tag> {
  return mutateTags(projectRoot, (project) => {
    const checked = checkTagFields(project.config?.tags ?? [], changes);
    return { result: addTag(project, checked.name, checked.color) };
  });
}

/**
 * Renames and recolours a tag in place. The tag keeps its id, so every
 * resource assignment and saved query that refers to it follows the change.
 *
 * The name is trimmed. It must not be blank and must not match another tag's
 * name (trimmed, ignoring capitals). `changes.color` replaces the tag's
 * colour; leaving it out clears the colour. A colour must be a `#rgb` or
 * `#rrggbb` hex string.
 *
 * @param projectRoot - Absolute path to the project's root directory.
 * @param tagId       - UUID of the tag to change.
 * @param changes     - The new name and optional colour.
 * @returns The updated {@link Tag}.
 * @throws {TagNotFoundError} If no tag has `tagId`.
 * @throws {TagRefusedError} If the name or colour is refused.
 * @throws {Error} If the project file cannot be read or written.
 *
 * @example
 * await updateTag("/projects/my-project", "abc123", { name: "First draft" });
 * // => { id: "abc123", name: "First draft" } (colour cleared)
 */
export async function updateTag(
  projectRoot: string,
  tagId: string,
  changes: TagChanges,
): Promise<Tag> {
  return mutateTags(projectRoot, (project) => {
    const tags = project.config?.tags ?? [];
    const index = tags.findIndex((t) => t.id === tagId);
    if (index === -1) throw new TagNotFoundError(tagId);

    const { name, color } = checkTagFields(tags, changes, tagId);

    const updated: Tag = color
      ? { id: tagId, name, color }
      : { id: tagId, name };
    tags[index] = updated;
    return { result: updated };
  });
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
  await mutateTags(projectRoot, (project) => {
    const config = project.config ?? { editorConfig: {} };
    config.tagAssignments = config.tagAssignments ?? {};
    config.tagAssignments[resourceId] = config.tagAssignments[resourceId] ?? [];
    if (!config.tagAssignments[resourceId].includes(tagId)) {
      config.tagAssignments[resourceId].push(tagId);
    }
    project.config = config;
    return { result: undefined };
  });
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
  await mutateTags(projectRoot, (project) => {
    if (!project.config?.tagAssignments?.[resourceId]) {
      return { result: undefined, shouldWrite: false };
    }
    project.config.tagAssignments[resourceId] = project.config.tagAssignments[
      resourceId
    ].filter((id: string) => id !== tagId);
    return { result: undefined };
  });
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
  return Object.entries(assignments)
    .filter(([, tagIds]) => tagIds.includes(tagId))
    .map(([resourceId]) => resourceId);
}

/**
 * Convenience default export that bundles all tag operations into a single
 * object. Prefer named imports for tree-shaking; use this default export when
 * the full API surface needs to be passed around as a dependency.
 */
const tagOperations = {
  listTags,
  createTag,
  createCheckedTag,
  deleteTag,
  updateTag,
  assignTagToResource,
  unassignTagFromResource,
  listResourcesByTag,
};

export default tagOperations;
