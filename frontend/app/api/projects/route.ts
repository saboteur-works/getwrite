import { NextResponse } from "next/server";
import path from "node:path";
import { getProjectType } from "../../../src/lib/projectTypes";
import { createProjectFromType } from "../../../src/lib/models/project-creator";
import { generateUUID } from "../../../src/lib/models/uuid";
import fs from "node:fs/promises";
import { getLocalResources } from "../../../src/lib/models";

const resolveProjectsDir = () =>
    process.env.GETWRITE_PROJECTS_DIR ??
    path.join(process.cwd(), "..", "projects");

async function readFolderTree(dir: string): Promise<unknown[]> {
    const result: unknown[] = [];
    let names: string[];
    try {
        names = (await fs.readdir(dir)).filter((n) => n !== ".DS_Store");
    } catch {
        return result;
    }
    for (const name of names) {
        const subDir = path.join(dir, name);
        try {
            const stat = await fs.stat(subDir);
            if (!stat.isDirectory()) continue;
        } catch {
            continue;
        }
        try {
            const data = await fs.readFile(
                path.join(subDir, "folder.json"),
                "utf-8",
            );
            result.push(JSON.parse(data));
        } catch {
            // no folder.json, skip
        }
        result.push(...(await readFolderTree(subDir)));
    }
    return result;
}

const getProject = async (id: string) => {
    const projectDirPath = path.join(resolveProjectsDir(), id);
    const projectDirectory = await fs.readdir(projectDirPath);

    return NextResponse.json(projectDirectory);
};

/**
 * Get all projects from the local filesystem. Each project includes its metadata, folders, and resources.
 */
export async function GET(req: Request) {
    try {
        // get all projects from local
        const projectsDir = resolveProjectsDir();
        const projectIds = (await fs.readdir(projectsDir)).filter(
            (file) => file !== ".DS_Store",
        );
        const projects = await Promise.all(
            projectIds.map(async (id) => {
                const projectPath = path.join(projectsDir, id, "project.json");
                const projectData = await fs.readFile(projectPath, "utf-8");
                const project = JSON.parse(projectData);

                const foldersPath = path.join(projectsDir, id, "folders");
                const folders = await readFolderTree(foldersPath);

                const resources = getLocalResources(path.join(projectsDir, id));
                return {
                    project,
                    resources,
                    folders,
                };
            }),
        );

        return NextResponse.json(projects);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { name, projectType } = body as {
            name?: string;
            projectType?: string;
        };

        if (!name || !projectType) {
            return NextResponse.json(
                { error: "Missing name or projectType" },
                { status: 400 },
            );
        }
        const entry = await getProjectType(projectType);
        if (!entry) {
            return NextResponse.json(
                { error: "Project type not found" },
                { status: 404 },
            );
        }

        const id = generateUUID();
        const projectRoot = path.join(resolveProjectsDir(), id);

        const result = await createProjectFromType({
            projectRoot,
            spec: entry.filePath,
            name,
        });

        return NextResponse.json({
            project: result.project,
            folders: result.folders,
            resources: result.resources,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export const dynamic = "force-dynamic";
