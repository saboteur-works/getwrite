import { NextResponse } from "next/server";

import {
  createResourceOfType,
  validateMediaFile,
  writeResourceToFile,
} from "../../../../src/lib/models";
import {
  extractAudioMetadata,
  extractImageMetadata,
} from "../../../../src/lib/models/media-metadata";
import { resolveProjectPath } from "../../../../src/lib/models/project-path";
import { withStorageContext } from "../../_tenant/with-storage-context";

/** Strips a trailing file extension to derive a display name. */
function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, "");
}

/**
 * Creates an image/audio resource from a multipart upload.
 *
 * Expects `multipart/form-data` with `file` (the binary), `projectId`, and
 * optional `title` and `folderId`. The file is validated, type-specific
 * metadata is extracted, and the resource plus its binary are persisted.
 */
async function handlePost(req: Request): Promise<Response> {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const projectId = form.get("projectId");
    const title = form.get("title");
    const folderIdRaw = form.get("folderId");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "A 'file' field is required." },
        { status: 400 },
      );
    }

    const resolved = resolveProjectPath(
      typeof projectId === "string" ? projectId : "",
    );
    if (resolved instanceof Response) return resolved;
    const { projectPath } = resolved;

    const validation = validateMediaFile({
      mime: file.type || undefined,
      ext: file.name,
      size: file.size,
    });
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.message, reason: validation.reason },
        { status: 400 },
      );
    }

    const name =
      typeof title === "string" && title.trim().length > 0
        ? title.trim()
        : stripExtension(file.name) || "Untitled";
    const folderId =
      typeof folderIdRaw === "string" && folderIdRaw.length > 0
        ? folderIdRaw
        : undefined;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const fileName = `original.${validation.extension}`;

    const resource =
      validation.type === "image"
        ? createResourceOfType("image", {
            name,
            type: "image",
            folderId,
            image: { file: fileName, ...(await extractImageMetadata(bytes)) },
          })
        : createResourceOfType("audio", {
            name,
            type: "audio",
            folderId,
            audio: {
              file: fileName,
              ...(await extractAudioMetadata(bytes, validation.extension)),
            },
          });

    // writeResourceToFile serializes its sidecar write via the per-project
    // meta lock internally, so no outer lock is needed here (and adding one
    // would deadlock, since the lock is non-reentrant).
    await writeResourceToFile(projectPath, resource, { binary: bytes });

    return NextResponse.json({ success: true, resource });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to upload media",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export const POST = withStorageContext(handlePost);
