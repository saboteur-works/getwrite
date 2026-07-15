import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import {
  readSidecar,
  writeSidecar,
} from "../../../../../src/lib/models/sidecar";
import { withMetaLock } from "../../../../../src/lib/models/meta-locks";
import { resolveProjectsDir } from "../../../../../src/lib/models/projects-dir";
import { withStorageContext } from "../../../_tenant/with-storage-context";

async function findProjectRoot(projectsDir: string, projectId: string) {
  try {
    const names = await fs.readdir(projectsDir, { withFileTypes: true });
    for (const d of names) {
      if (!d.isDirectory()) continue;
      const candidate = path.join(projectsDir, d.name);
      const pj = path.join(candidate, "project.json");
      try {
        const parsed = JSON.parse(await fs.readFile(pj, "utf8")) as {
          id?: string;
        };
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

async function reorder(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const projectId = (await params)["projectId"];
  const body = await req.json().catch(() => ({}));
  const folderOrder: Array<{
    id: string;
    orderIndex: number;
    folderId?: string | null;
  }> = body.folderOrder ?? [];
  const resourceOrder: Array<{
    id: string;
    orderIndex: number;
    folderId?: string | null;
  }> = body.resourceOrder ?? [];

  const projectsDir = resolveProjectsDir();
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
        .catch(() => [] as Dirent[]);

      for (const fo of folderOrder) {
        for (const d of folderDirs) {
          if (!d.isDirectory()) continue;
          const folderJson = path.join(foldersDir, d.name, "folder.json");
          try {
            const parsed = JSON.parse(
              await fs.readFile(folderJson, "utf8"),
            ) as { id?: string; orderIndex?: number; parentId?: string | null };
            if (parsed && parsed.id === fo.id) {
              parsed.orderIndex = fo.orderIndex;
              parsed.parentId = fo.folderId ?? null;
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
      const existing = await readSidecar(projectRoot, ro.id).catch(() => null);
      const merged = {
        ...(existing ?? {}),
        orderIndex: ro.orderIndex,
        folderId: ro.folderId ?? existing?.folderId ?? null,
      };
      await writeSidecar(projectRoot, ro.id, merged);
    } catch (err) {
      // log and continue
      // eslint-disable-next-line no-console
      console.error("resource sidecar update failed", ro.id, err);
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

export const POST = withStorageContext(reorder);

export const GET = withStorageContext(() => new Response(null, { status: 200 }));
