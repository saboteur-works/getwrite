/**
 * @module frontend/lib/models/project-creator
 *
 * Module responsibilities:
 * - Load and validate project-type templates (JSON) provided as objects or
 *   file paths.
 * - Create a persisted project scaffold on disk under a provided
 *   `projectRoot`: writes `project.json`, creates a `folders/` tree with
 *   folder descriptor files, and scaffolds default resources under
 *   `resources/` with accompanying sidecar metadata in `meta/`.
 * - Return a runtime `Project` model alongside the created `Folder` and
 *   `TextResource` objects so callers can integrate the newly-created
 *   project into application state immediately.
 *
 * Error handling and guarantees:
 * - Template validation is performed via `validateProjectTypeFile` or
 *   `validateProjectType`. Validation failures throw an `Error` with
 *   details. Filesystem errors (mkdir/write) are propagated to the caller.
 * - Resource sidecars are written and awaited before this module resolves
 *   so callers can read metadata immediately after `createProjectFromType`
 *   completes.
 *
 * Usage example:
 * ```ts
 * import { createProjectFromType } from "./project-creator";
 *
 * await createProjectFromType({
 *   projectRoot: "/tmp/my-novel",
 *   spec: "getwrite-config/templates/project-types/novel_project_type.json",
 *   name: "My Novel",
 * });
 * ```
 *
 * Notes:
 * - This module implements minimal, filesystem-backed scaffolding intended
 *   for local/offline development flows. It intentionally keeps behavior
 *   synchronous from the caller's perspective (async API) and attempts to
 *   ensure on-disk invariants before returning.
 *
 * See: `frontend/src/lib/models/schemas.ts`, `resource.ts`, and `sidecar.ts`.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createProject } from "./project";
import { generateUUID } from "./uuid";
import { validateProjectTypeFile, validateProjectType } from "./schemas";
import type { Project, Folder, TextResource, ResourceType } from "./types";
import { createResourceOfType, writeResourceToFile } from "./resource";

/**
 * Minimal spec types for project-type JSON files.
 *
 * These interfaces model the minimal shape expected in the project-type
 * templates stored under `getwrite-config/templates/project-types`.
 */
export interface ProjectTypeSpecFolder {
    /** Human-friendly folder name (displayed in the UI). */
    name: string;
    /**
     * Optional flag for special folders (e.g. workspace, drafts). Implementation
     * may choose to treat `special` folders differently in ordering or UI.
     */
    special?: boolean;
}

/**
 * Minimal spec type for resources declared in a project-type template.
 *
 * - `folder` is the name of the folder (as declared in `folders`) where the
 *   resource should be created. It is matched by slug (see `slugify`).
 * - `name` is the human-friendly resource name.
 * - `type` is the resource type (currently supports `text`, `image`, `audio`).
 * - `template` contains initial text content for text resources.
 */
export interface ProjectTypeSpecResource {
    /** Folder name (not slug) to place the resource under. */
    folder: string;
    /** Display name for the resource. */
    name: string;
    /** Resource type; aligns with runtime `ResourceType`. */
    type: ResourceType;
    /** Optional template content used when creating text resources. */
    template?: string;
}

/**
 * Minimal project-type specification.
 *
 * These files describe a project scaffold (folders and optional default
 * resources) that can be used to create a new project via
 * `createProjectFromType`.
 */
export interface ProjectTypeSpec {
    /** Stable identifier for the project type (used when persisting). */
    id: string;
    /** Human-friendly name shown in the UI for the template. */
    name: string;
    /** Optional longer description explaining the template's intent. */
    description?: string;
    /** List of folders to create for the new project. */
    folders: ProjectTypeSpecFolder[];
    /** Optional list of default resources to scaffold inside the folders. */
    defaultResources?: ProjectTypeSpecResource[];
}

/**
 * Slugify a string for use in file and folder names.
 *
 * Converts a human-friendly folder name into a file-system-friendly slug by
 * lowercasing, replacing whitespace with hyphens and removing non-alphanumeric
 * characters. This same transformation is used when matching a `folder` name
 * from `ProjectTypeSpecResource` to the created folder directory.
 *
 * @example
 * const slug = slugify("Chapter 1: The Beginning") // "chapter-1-the-beginning"
 */
function slugify(s: string): string {
    return s
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9\-]/g, "");
}

/**
 * Create a new project on disk from a project-type spec object or JSON file
 * path.
 *
 * This function performs the following steps:
 * - Validates and loads the provided project-type spec (either object or
 *   path to a JSON template file).
 * - Ensures the `projectRoot` directory exists and writes a `project.json`.
 * - Creates a `folders/` directory with folder descriptor files.
 * - Creates default resources (currently only text resources) under
 *   `resources/` and writes their sidecar metadata.
 *
 * @param options.projectRoot - Root path where the project will be created.
 * @param options.spec - The project-type specification object or an absolute
 *   / relative path to a JSON file containing the spec. When a path is
 *   provided, it is validated with `validateProjectTypeFile`.
 * @param options.name - Optional project name. Defaults to the template's
 *   `name` if omitted.
 * @returns An object containing the created `project` model, the list of
 * created `folders`, and any scaffolded `resources`.
 * @throws {Error} If the provided spec (file or object) fails validation.
 * @throws {Error} If filesystem operations fail while creating files or
 * directories.
 *
 * @example
 * await createProjectFromType({
 *   projectRoot: "/tmp/my-project",
 *   spec: "getwrite-config/templates/project-types/novel_project_type.json",
 *   name: "My Novel",
 * });
 */
export async function createProjectFromType(options: {
    /** Root path where the project will be created. */
    projectRoot: string;
    /** Project-type specification, either as an object or a path to a JSON file. */
    spec: ProjectTypeSpec | string;
    /** Optional name for the project; if not provided, will use the name from the spec. */
    name?: string;
}): Promise<{
    project: Project;
    folders: Folder[];
    resources: TextResource[];
}> {
    const { projectRoot, spec, name } = options;

    // Load and validate spec (file path or object)
    /** The spec for this project */
    let specObj: ProjectTypeSpec;
    if (typeof spec === "string") {
        const res = await validateProjectTypeFile(spec);
        if (!res.success)
            throw new Error(
                `Invalid project-type spec file: ${JSON.stringify(res.errors)}`,
            );
        specObj = res.value as ProjectTypeSpec;
    } else {
        const res = validateProjectType(spec);
        if (!res.success)
            throw new Error(
                `Invalid project-type spec object: ${JSON.stringify(res.errors)}`,
            );
        specObj = res.value as ProjectTypeSpec;
    }

    // Ensure project root exists
    await fs.mkdir(projectRoot, { recursive: true });

    // Create Project JSON
    const project = createProject({
        name: name ?? specObj.name,
        projectType: specObj.id,
        rootPath: projectRoot,
    });
    const projectJsonPath = path.join(projectRoot, "project.json");
    await fs.writeFile(
        projectJsonPath,
        JSON.stringify(project, null, 2),
        "utf8",
    );

    // Create folders (directories) and folder model objects
    const foldersDir = path.join(projectRoot, "folders");
    await fs.mkdir(foldersDir, { recursive: true });
    const folders: Folder[] = [];

    for (let i = 0; i < specObj.folders.length; i += 1) {
        const f = specObj.folders[i];
        const id = generateUUID();
        const slug = slugify(String(f.name));
        const dir = path.join(foldersDir, slug);
        await fs.mkdir(dir, { recursive: true });
        const now = new Date().toISOString();
        const folderObj: Folder = {
            id,
            slug,
            name: f.name,
            parentId: null,
            orderIndex: i,
            createdAt: now,
            type: "folder",
            special: f.special,
        };
        folders.push(folderObj);
        // write a small folder descriptor file so the structure is discoverable
        await fs.writeFile(
            path.join(dir, "folder.json"),
            JSON.stringify(folderObj, null, 2),
            "utf8",
        );
    }

    // Create default resources (placeholders) and sidecars
    const resources: TextResource[] = [];
    const resourcesDir = path.join(projectRoot, "resources");
    await fs.mkdir(resourcesDir, { recursive: true });

    for (let j = 0; j < (specObj.defaultResources ?? []).length; j += 1) {
        const r = specObj.defaultResources![j];
        const folderSlug = r.folder
            ? slugify(String(r.folder))
            : folders[0].slug;
        const folder =
            folders.find((ff) => ff.slug === folderSlug) ?? folders[0];

        // For MVP, only support text resource templates
        if (r.type === "text") {
            const typedResource = createResourceOfType("text", {
                name: r.name,
                type: "text",
                folderId: folder.id,
                text: {
                    plainText: r.template ?? "",
                },
                orderIndex: j,
                metadata: { orderIndex: j },
            });
            resources.push(typedResource as TextResource);
            await writeResourceToFile(projectRoot, typedResource);
        }
    }

    return { project, folders, resources };
}

export default { createProjectFromType };
