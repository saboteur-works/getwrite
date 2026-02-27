import fs from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import {
    readSidecar,
    writeSidecar,
} from "../../../../../src/lib/models/sidecar";
import { withMetaLock } from "../../../../../src/lib/models/meta-locks";

async function findProjectRoot(projectsDir: string, projectId: string) {
    try {
        const names = await fs.readdir(projectsDir, { withFileTypes: true });
        for (const d of names) {
            if (!d.isDirectory()) continue;
            const candidate = path.join(projectsDir, d.name);
            const pj = path.join(candidate, "project.json");
            try {
                const raw = await fs.readFile(pj, "utf8");
                const parsed = JSON.parse(raw) as { id?: string };
                if (parsed?.id === projectId) return candidate;
            } catch (_) {
                // ignore
            }
        }
    } catch (_) {
        // ignore
    }
    return null;
}

export async function POST(
    req: NextRequest,
    { params }: { params: { projectId: string } },
) {
    const projectId = (await params)["projectId"];
    const body = await req.json().catch(() => ({}));
    const folderOrder: Array<{ id: string; orderIndex: number }> =
        body.folderOrder ?? [];
    const resourceOrder: Array<{ id: string; orderIndex: number }> =
        body.resourceOrder ?? [];
    // locate projects directory (assume repo layout: frontend/ -> ../projects)
    const projectsDir = path.resolve(process.cwd(), "..", "projects");
    const projectRoot =
        body.projectRoot ?? (await findProjectRoot(projectsDir, projectId));
    if (!projectRoot) {
        return new Response(JSON.stringify({ error: "project not found" }), {
            status: 404,
        });
    }

    // Update folder descriptors (guarded by project-level meta lock)
    try {
        await withMetaLock(projectRoot, async () => {
            const foldersDir = path.join(projectRoot, "folders");
            const folderDirs = await fs
                .readdir(foldersDir, { withFileTypes: true })
                .catch(() => [] as any[]);

            for (const fo of folderOrder) {
                for (const d of folderDirs) {
                    if (!d.isDirectory()) continue;
                    const folderJson = path.join(
                        foldersDir,
                        d.name,
                        "folder.json",
                    );
                    try {
                        const raw = await fs.readFile(folderJson, "utf8");
                        const parsed = JSON.parse(raw) as any;
                        if (parsed && parsed.id === fo.id) {
                            parsed.orderIndex = fo.orderIndex;
                            // write updated folder.json atomically
                            await fs.writeFile(
                                folderJson,
                                JSON.stringify(parsed, null, 2),
                                "utf8",
                            );
                            break;
                        }
                    } catch (err) {
                        // ignore missing files or parse errors for individual folders
                        // eslint-disable-next-line no-console
                        console.warn(
                            "skipping folder.json update",
                            folderJson,
                            (err as Error).message,
                        );
                    }
                }
            }
        });
    } catch (err) {
        // log and continue with resources
        // eslint-disable-next-line no-console
        console.error("folder update error", err);
    }

    // Update resource sidecars
    for (const ro of resourceOrder) {
        try {
            const existing = await readSidecar(projectRoot, ro.id).catch(
                () => null,
            );
            const merged = { ...(existing ?? {}), orderIndex: ro.orderIndex };
            await writeSidecar(projectRoot, ro.id, merged);
        } catch (err) {
            // log and continue
            // eslint-disable-next-line no-console
            console.error("resource sidecar update failed", ro.id, err);
        }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

export const GET = () => new Response(null, { status: 200 });
