/**
 * @module api/resource/revision/[resource-id]
 *
 * Next.js route handlers for revision lifecycle on a single resource.
 *
 * GET    /api/resource/revision/:resourceId?projectPath=...&revisionId=...
 *   Returns revision metadata and content for a specific revision.
 *
 * POST   /api/resource/revision/:resourceId
 *   Saves a new revision. Reads current filesystem content when body.content
 *   is omitted.
 *
 * PATCH  /api/resource/revision/:resourceId
 *   Marks an existing revision as canonical.
 *
 * DELETE /api/resource/revision/:resourceId
 *   Removes a revision directory by revision UUID.
 */
import path from "node:path";
import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import {
    listRevisions,
    revisionDir,
    setCanonicalRevision,
    writeRevision,
} from "../../../../../src/lib/models/revision";
import type { Revision } from "../../../../../src/lib/models/types";

/**
 * Shape of the response returned by the GET handler.
 */
interface GetRevisionResponse {
    /** Revision metadata. */
    revision: Revision;
    /** Raw revision content as a UTF-8 string. */
    content: string;
}

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
    /** Optional arbitrary metadata to persist with the revision (e.g. user-provided name). */
    metadata?: Record<string, unknown>;
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
 * Expected shape of the PATCH request body.
 */
interface SetCanonicalRevisionBody {
    /** Absolute path to the project root on the server filesystem. */
    projectPath: string;
    /** Revision UUID to mark canonical. */
    revisionId: string;
    /** Optional revision content to persist in-place for canonical revisions. */
    content?: string;
}

/**
 * Finds a revision by UUID within a resource's stored revisions.
 *
 * @param projectPath - Absolute path to the project root.
 * @param resourceId - Resource UUID.
 * @param revisionId - Revision UUID to locate.
 * @returns Matching revision metadata.
 * @throws {Error} If the revision is not found.
 */
async function findRevisionById(
    projectPath: string,
    resourceId: string,
    revisionId: string,
): Promise<Revision> {
    const revisions = await listRevisions(projectPath, resourceId);
    const match = revisions.find((r) => r.id === revisionId);
    if (!match) {
        throw new Error(`Revision ${revisionId} not found.`);
    }
    return match;
}

/**
 * Reads the `content.bin` file for a specific revision.
 *
 * @param projectPath - Absolute path to the project root.
 * @param resourceId - Resource UUID.
 * @param versionNumber - Revision version number.
 * @returns Raw content as a UTF-8 string.
 * @throws {Error} If `content.bin` cannot be read.
 */
async function readRevisionContent(
    projectPath: string,
    resourceId: string,
    versionNumber: number,
): Promise<string> {
    const contentPath = path.join(
        revisionDir(projectPath, resourceId, versionNumber),
        "content.bin",
    );
    return fs.readFile(contentPath, "utf8");
}

/**
 * Writes `content.bin` for a specific revision version.
 *
 * @param projectPath - Absolute path to the project root.
 * @param resourceId - Resource UUID.
 * @param versionNumber - Revision version number.
 * @param content - Raw content string to persist.
 */
async function writeRevisionContent(
    projectPath: string,
    resourceId: string,
    versionNumber: number,
    content: string,
): Promise<void> {
    const contentPath = path.join(
        revisionDir(projectPath, resourceId, versionNumber),
        "content.bin",
    );
    await fs.writeFile(contentPath, content, "utf8");
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
 * GET handler — retrieves a revision's metadata and content by revision UUID.
 *
 * Query parameters:
 * - `projectPath` (required) — absolute path to the project root.
 * - `revisionId`  (required) — UUID of the revision to retrieve.
 *
 * Responses:
 * - `200 OK` with `{ revision, content }` on success.
 * - `400 Bad Request` when required query params are missing.
 * - `404 Not Found` when the revision cannot be found.
 * - `500 Internal Server Error` when reading content fails.
 *
 * @param req - Incoming Next.js request.
 * @param context - Route context containing the `resource-id` path param.
 * @returns JSON response containing revision metadata and content.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ "resource-id": string }> },
) {
    const resourceId = (await params)["resource-id"];
    const { searchParams } = new URL(req.url);

    const projectPath = searchParams.get("projectPath");
    const revisionId = searchParams.get("revisionId");

    if (!projectPath) {
        return NextResponse.json(
            { error: "Missing required query param: projectPath." },
            { status: 400 },
        );
    }

    if (!revisionId) {
        return NextResponse.json(
            { error: "Missing required query param: revisionId." },
            { status: 400 },
        );
    }

    try {
        const revision = await findRevisionById(
            projectPath,
            resourceId,
            revisionId,
        );

        const content = await readRevisionContent(
            projectPath,
            resourceId,
            revision.versionNumber,
        );

        const responseBody: GetRevisionResponse = { revision, content };
        return NextResponse.json(responseBody, { status: 200 });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Failed to retrieve revision.";
        const status = message.includes("not found") ? 404 : 500;
        return NextResponse.json({ error: message }, { status });
    }
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

    const {
        projectPath,
        content: bodyContent,
        author,
        isCanonical,
        metadata,
    } = body;

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
                metadata,
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

/**
 * PATCH handler — marks an existing revision as canonical.
 *
 * Request body: {@link SetCanonicalRevisionBody}
 *
 * Responses:
 * - `200 OK` with the updated canonical `Revision` metadata on success.
 * - `400 Bad Request` when required fields are missing.
 * - `404 Not Found` when the revision cannot be found.
 * - `500 Internal Server Error` when update fails.
 *
 * @param req - Incoming Next.js request.
 * @param context - Route context containing the `resource-id` path param.
 * @returns JSON response containing the updated revision or an error message.
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ "resource-id": string }> },
) {
    const resourceId = (await params)["resource-id"];

    let body: SetCanonicalRevisionBody;
    try {
        body = (await req.json()) as SetCanonicalRevisionBody;
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body." },
            { status: 400 },
        );
    }

    const { projectPath, revisionId, content } = body;

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
        const revisions = await listRevisions(projectPath, resourceId);
        const target = revisions.find((revision) => revision.id === revisionId);

        if (!target) {
            return NextResponse.json(
                { error: `Revision ${revisionId} not found.` },
                { status: 404 },
            );
        }

        if (typeof content === "string") {
            if (!target.isCanonical) {
                return NextResponse.json(
                    {
                        error: "Only the canonical revision can be updated in place.",
                    },
                    { status: 400 },
                );
            }

            await writeRevisionContent(
                projectPath,
                resourceId,
                target.versionNumber,
                content,
            );

            return NextResponse.json(target, { status: 200 });
        }

        const canonicalRevision = await setCanonicalRevision(
            projectPath,
            resourceId,
            target.versionNumber,
        );

        if (!canonicalRevision) {
            return NextResponse.json(
                { error: `Revision ${revisionId} not found.` },
                { status: 404 },
            );
        }

        return NextResponse.json(canonicalRevision, { status: 200 });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Failed to set canonical revision.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
