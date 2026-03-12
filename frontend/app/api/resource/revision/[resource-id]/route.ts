/**
 * @module api/resource/revision/[resource-id]
 *
 * Next.js route handler for creating a new revision for a resource.
 *
 * POST /api/resource/revision/:resourceId
 *
 * Accepts a JSON body containing the project path and optional revision options.
 * When `content` is omitted the handler reads the resource's current saved
 * content from the filesystem (`content.tiptap.json`, falling back to
 * `content.txt`). Determines the next version number by listing existing
 * revisions and calls `writeRevision` to atomically persist the new revision.
 */
import path from "node:path";
import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import {
    listRevisions,
    revisionDir,
    writeRevision,
} from "../../../../../src/lib/models/revision";

/**
 * Expected shape of the POST request body.
 *
 * When `content` is omitted the handler reads the resource's current saved
 * content from the filesystem.
 */
interface SaveRevisionBody {
    /** Absolute path to the project root on the server filesystem. */
    projectPath: string;
    /**
     * Revision content to persist in `content.bin`.
     * When omitted, the current resource content is read from the filesystem.
     */
    content?: string;
    /** Optional author identifier or display name stored in metadata. */
    author?: string;
    /** When true, marks the new revision as canonical. Defaults to false. */
    isCanonical?: boolean;
}

/**
 * Expected shape of the DELETE request body.
 */
interface DeleteRevisionBody {
    /** Absolute path to the project root on the server filesystem. */
    projectPath: string;
    /** Revision UUID to delete. */
    revisionId: string;
}

/**
 * Reads the current saved content for a resource from the filesystem.
 *
 * Checks for `content.tiptap.json` first, then falls back to `content.txt`.
 * Returns the raw file contents as a string, or throws if neither file exists.
 *
 * @param projectPath - Absolute path to the project root.
 * @param resourceId - Resource UUID.
 * @returns Raw content string.
 * @throws {Error} If no readable content file is found.
 */
async function readCurrentResourceContent(
    projectPath: string,
    resourceId: string,
): Promise<string> {
    const resourceDir = path.join(projectPath, "resources", resourceId);

    const tiptapPath = path.join(resourceDir, "content.tiptap.json");
    try {
        return await fs.readFile(tiptapPath, "utf8");
    } catch {
        // Fall through to plaintext
    }

    const plaintextPath = path.join(resourceDir, "content.txt");
    try {
        return await fs.readFile(plaintextPath, "utf8");
    } catch {
        throw new Error(
            `No readable content file found for resource ${resourceId}.`,
        );
    }
}

/**
 * Derives the next sequential version number for a resource.
 *
 * Returns 1 when no prior revisions exist, otherwise increments the
 * highest existing version number by 1.
 *
 * @param projectPath - Absolute path to the project root.
 * @param resourceId - Resource UUID.
 * @returns The next version number to assign.
 */
async function resolveNextVersionNumber(
    projectPath: string,
    resourceId: string,
): Promise<number> {
    const existing = await listRevisions(projectPath, resourceId);
    if (existing.length === 0) return 1;
    const highest = Math.max(...existing.map((r) => r.versionNumber));
    return highest + 1;
}

/**
 * Deletes a single revision by revision UUID.
 *
 * @param projectPath - Absolute path to the project root.
 * @param resourceId - Resource UUID.
 * @param revisionId - Revision UUID.
 * @returns Deleted revision metadata.
 * @throws {Error} If the revision does not exist or deletion fails.
 */
async function deleteRevisionById(
    projectPath: string,
    resourceId: string,
    revisionId: string,
) {
    const revisions = await listRevisions(projectPath, resourceId);
    const revision = revisions.find((entry) => entry.id === revisionId);

    if (!revision) {
        throw new Error(`Revision ${revisionId} not found.`);
    }

    const directory = revisionDir(
        projectPath,
        resourceId,
        revision.versionNumber,
    );
    await fs.rm(directory, { recursive: true, force: true });

    return revision;
}

/**
 * POST handler — saves a new revision for the given resource.
 *
 * Request body: {@link SaveRevisionBody}
 *
 * Responses:
 * - `201 Created` with the persisted `Revision` metadata on success.
 * - `400 Bad Request` when required fields are missing.
 * - `500 Internal Server Error` when the write fails.
 *
 * @param req - Incoming Next.js request.
 * @param context - Route context containing the `resource-id` path param.
 * @returns JSON response containing the saved revision or an error message.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ "resource-id": string }> },
) {
    const resourceId = (await params)["resource-id"];

    let body: SaveRevisionBody;
    try {
        body = (await req.json()) as SaveRevisionBody;
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body." },
            { status: 400 },
        );
    }

    const { projectPath, content: bodyContent, author, isCanonical } = body;

    if (!projectPath || typeof projectPath !== "string") {
        return NextResponse.json(
            { error: "Missing required field: projectPath." },
            { status: 400 },
        );
    }

    try {
        const content =
            bodyContent ??
            (await readCurrentResourceContent(projectPath, resourceId));

        const versionNumber = await resolveNextVersionNumber(
            projectPath,
            resourceId,
        );

        const revision = await writeRevision(
            projectPath,
            resourceId,
            versionNumber,
            content,
            {
                author,
                isCanonical: isCanonical ?? false,
            },
        );

        return NextResponse.json(revision, { status: 201 });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to save revision.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * DELETE handler — removes a persisted revision for the given resource.
 *
 * Request body: {@link DeleteRevisionBody}
 *
 * Responses:
 * - `200 OK` with the deleted `Revision` metadata on success.
 * - `400 Bad Request` when required fields are missing.
 * - `404 Not Found` when the revision cannot be found.
 * - `500 Internal Server Error` when deletion fails.
 *
 * @param req - Incoming Next.js request.
 * @param context - Route context containing the `resource-id` path param.
 * @returns JSON response containing the deleted revision or an error message.
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ "resource-id": string }> },
) {
    const resourceId = (await params)["resource-id"];

    let body: DeleteRevisionBody;
    try {
        body = (await req.json()) as DeleteRevisionBody;
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body." },
            { status: 400 },
        );
    }

    const { projectPath, revisionId } = body;

    if (!projectPath || typeof projectPath !== "string") {
        return NextResponse.json(
            { error: "Missing required field: projectPath." },
            { status: 400 },
        );
    }

    if (!revisionId || typeof revisionId !== "string") {
        return NextResponse.json(
            { error: "Missing required field: revisionId." },
            { status: 400 },
        );
    }

    try {
        const deletedRevision = await deleteRevisionById(
            projectPath,
            resourceId,
            revisionId,
        );

        return NextResponse.json(deletedRevision, { status: 200 });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Failed to delete revision.";
        const status = message.includes("not found") ? 404 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
