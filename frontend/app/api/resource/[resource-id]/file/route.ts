import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

import {
  IMAGE_EXTENSION_MIME,
  AUDIO_EXTENSION_MIME,
} from "../../../../../src/lib/models/media-validation";
import { readSidecar } from "../../../../../src/lib/models/sidecar";
import { resolveProjectsDir } from "../../../../../src/lib/models/projects-dir";
import {
  InvalidProjectIdError,
  respondInvalidProjectId,
  validateProjectId,
} from "../../../../../src/lib/models/project-path";
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

  let validatedProjectId: string;
  try {
    validatedProjectId = validateProjectId(projectId ?? "");
  } catch (err) {
    if (err instanceof InvalidProjectIdError) return respondInvalidProjectId();
    throw err;
  }
  const projectPath = path.join(resolveProjectsDir(), validatedProjectId);

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
    const bytes = await fs.readFile(filePath);
    return new NextResponse(bytes, {
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
