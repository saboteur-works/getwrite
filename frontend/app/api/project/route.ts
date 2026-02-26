import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { Project } from "../../../src/lib/models";
import { readSidecar } from "../../../src/lib/models/sidecar";

/**
 * Retrieve a project and its folders and resources from disk.
 */
export async function POST(req: NextRequest) {
    const body = await req.json();
    const { projectPath } = body as { projectPath: string };
    const projectFile = await fs.readFile(
        path.join(projectPath, "project.json"),
        { encoding: "utf-8" },
    );
    const project: Project = JSON.parse(projectFile);
    const foldersDir = path.join(projectPath, "folders");
    const metadataDir = path.join(projectPath, "meta");
    const resourcesDir = path.join(projectPath, "resources");

    const folders = await fs.readdir(foldersDir, { recursive: true });
    const folderArr = folders
        .filter((folderName) => !folderName.includes("."))
        .map((folderName) => {
            const folderPath = path.join(foldersDir, folderName, "folder.json");
            const data = fsSync.readFileSync(folderPath, { encoding: "utf-8" });
            return JSON.parse(data);
        });
    const metadata = await fs.readdir(metadataDir);
    const resourceArr = metadata
        .filter((metadataName) => metadataName.includes("."))
        .map(async (metadataName) => {
            const sidecar = await readSidecar(
                projectPath,
                metadataName.replace("resource-", "").replace(".meta.json", ""),
            );
            const resourceName = `content.txt`;
            const resourcePlaintext = fsSync.readFileSync(
                path.join(resourcesDir, sidecar?.id, resourceName),
                { encoding: "utf-8" },
            );

            return {
                ...sidecar,
                plaintext: resourcePlaintext,
            };
        });
    const resolvedResourceArr = await Promise.all(resourceArr);
    const f = {
        id: project.id,
        name: project.name,
        rootPath: projectPath,
        folders: folderArr,
        resources: resolvedResourceArr,
    };
    console.log(f);

    return NextResponse.json({
        project,
        folders: folderArr,
        resources: resolvedResourceArr,
    });
}
