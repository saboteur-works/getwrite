import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { projectPath, newName } = body as {
        projectPath: string;
        newName: string;
    };
    const projectFilePath = path.join(projectPath, "project.json");
    const projectFileContent = await fs.readFile(projectFilePath, "utf-8");
    const projectData = JSON.parse(projectFileContent);
    projectData.name = newName;
    await fs.writeFile(
        projectFilePath,
        JSON.stringify(projectData, null, 2),
        "utf-8",
    );
    return NextResponse.json({ success: true, data: projectData });
}
