import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {
    ProjectTypeSpec,
    validateProjectType,
} from "../../../src/lib/models/schemas";

const TEMPLATES_DIR =
    process.env.GETWRITE_TEMPLATES_DIR ??
    path.join(process.cwd(), "..", "getwrite-config", "templates", "project-types");

export async function GET() {
    try {
        const entries = await fs.readdir(TEMPLATES_DIR, {
            withFileTypes: true,
        });
        const results: ProjectTypeSpec[] = [];
        for (const e of entries) {
            if (!e.isFile() || !e.name.endsWith(".json")) continue;
            const fp = path.join(TEMPLATES_DIR, e.name);
            try {
                const raw = await fs.readFile(fp, "utf8");
                const parsed = JSON.parse(raw);
                const res: ReturnType<typeof validateProjectType> =
                    validateProjectType(parsed);
                if (res.success) {
                    results.push(res.value as ProjectTypeSpec);
                }
            } catch (err) {
                // skip invalid files
                continue;
            }
        }
        return NextResponse.json(results);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json(
            { error: "Cannot read project types", details: msg },
            { status: 500 },
        );
    }
}
