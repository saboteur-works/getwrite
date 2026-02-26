import fs from "node:fs/promises";
import path from "node:path";
import { createProject } from "./project";
import { generateUUID } from "./uuid";
import { validateProjectTypeFile, validateProjectType } from "./schemas";
import type { Project, Folder, TextResource, ResourceType } from "./types";
import { createResourceOfType, writeResourceToFile } from "./resource";

/** Minimal spec types for project-type JSON files. */
export interface ProjectTypeSpecFolder {
    name: string;
    special?: boolean;
}

/** Minimal spec type for resources in project-type JSON files. */
export interface ProjectTypeSpecResource {
    folder: string;
    name: string;
    type: ResourceType;
    template?: string;
}

/** Minimal spec type for project-type JSON files. */
export interface ProjectTypeSpec {
    id: string;
    name: string;
    description?: string;
    folders: ProjectTypeSpecFolder[];
    defaultResources?: ProjectTypeSpecResource[];
}

/** Slugify a string for use in file and folder names. */
function slugify(s: string): string {
    return s
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9\-]/g, "");
}

/** Create a new project on disk from a project-type spec object or JSON file path. */
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
