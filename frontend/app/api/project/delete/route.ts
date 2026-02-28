import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { projectPath } = body as { projectPath: string };
    await fs.rm(projectPath, { recursive: true, force: true });
    return NextResponse.json({ success: true });
}
