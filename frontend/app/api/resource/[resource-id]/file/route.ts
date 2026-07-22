import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

import {
  IMAGE_EXTENSION_MIME,
  AUDIO_EXTENSION_MIME,
} from "../../../../../src/lib/models/media-validation";
import { readFileBuffer } from "../../../../../src/lib/models/io";
import { readSidecar } from "../../../../../src/lib/models/sidecar";
import { resolveProjectPath } from "../../../../../src/lib/models/project-path";
import { withStorageContext } from "../../../_tenant/with-storage-context";

/** Derives a MIME type from a stored filename, falling back to octet-stream. */
function mimeForFile(fileName: string): string {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  return (
    IMAGE_EXTENSION_MIME[ext] ??
    AUDIO_EXTENSION_MIME[ext] ??
    "application/octet-stream"
  );
}

/**
 * Serves the stored binary for an image or audio resource.
 *
 * GET /api/resource/:resourceId/file?projectId=<uuid>
 *
 * Returns the raw bytes with the correct Content-Type derived from the
 * extension recorded in the sidecar. Returns 404 when the sidecar has no
 * 'file' entry or the binary does not exist on disk.
 */
async function handleGet(
  req: NextRequest,
  { params }: { params: Promise<{ "resource-id": string }> },
): Promise<Response> {
  const resourceId = (await params)["resource-id"];
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  const resolved = resolveProjectPath(projectId);
  if (resolved instanceof Response) return resolved;
  const { projectPath } = resolved;

  const sidecar = await readSidecar(projectPath, resourceId);
  const fileName = typeof sidecar?.file === "string" ? sidecar.file : null;

  if (!fileName) {
    return NextResponse.json(
      { error: "Resource has no stored file" },
      { status: 404 },
    );
  }

  const filePath = path.join(projectPath, "resources", resourceId, fileName);

  try {
    const bytes = await readFileBuffer(filePath);
    // Wrap in a Uint8Array view so the body is a BodyInit regardless of the
    // Buffer's backing ArrayBuffer generic.
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: { "Content-Type": mimeForFile(fileName) },
    });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    throw err;
  }
}

export const GET = withStorageContext(handleGet);
