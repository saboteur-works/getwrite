import { NextResponse } from "next/server";
import path from "node:path";
import { getProjectType } from "../../../src/lib/projectTypes";
import { createProjectFromType } from "../../../src/lib/models/project-creator";
import { generateUUID } from "../../../src/lib/models/uuid";
import fs from "node:fs/promises";

const getProject = async (id: string) => {
    const projectDirPath = path.join(process.cwd(), "..", "projects", id);
    const projectDirectory = await fs.readdir(projectDirPath);

    return NextResponse.json(projectDirectory);
};

export async function GET(req: Request) {
    // get all projects from local
    const projectsDir = path.join(process.cwd(), "..", "projects");
    const projectIds = await fs.readdir(projectsDir);
    const projects = await Promise.all(
        projectIds.map(async (id) => {
            const projectPath = path.join(projectsDir, id, "project.json");
            const projectData = await fs.readFile(projectPath, "utf-8");
            return JSON.parse(projectData);
        }),
    );

    return NextResponse.json(projects);
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
        const projectRoot = path.join(process.cwd(), "..", "projects", id);

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
