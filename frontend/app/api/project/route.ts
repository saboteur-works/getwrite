/**
 * @module app/api/project/route
 *
 * API endpoint for loading a project from disk, including folder descriptors
 * and resource sidecar metadata/plaintext.
 *
 * Route:
 * - `POST /api/project`
 *
 * Expected body:
 * - `{ projectPath: string }`
 *
 * Success payload:
 * - `{ project, folders, resources }`
 *
 * Failure payload:
 * - `{ error: string, details: string }` with HTTP 500
 */
import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { Project } from "../../../src/lib/models";
import { readSidecar } from "../../../src/lib/models/sidecar";

/** Request payload accepted by {@link POST}. */
interface LoadProjectRequestBody {
    /** Absolute path to the project root directory on disk. */
    projectPath: string;
}

/**
 * Resource payload returned by {@link POST}.
 *
 * Includes sidecar metadata fields plus a denormalized plaintext field loaded
 * from `resources/<resourceId>/content.txt`.
 */
interface LoadedResource {
    /** Resource UUID from sidecar metadata. */
    id: string;
    /** Human-readable resource name. */
    name?: string;
    /** Resource type key (`text`, `image`, `audio`, etc.). */
    type?: string;
    /** Resource creation timestamp (ISO string). */
    createdAt?: string;
    /** Optional parent folder UUID or `null`. */
    folderId?: string | null;
    /** Optional slug used by filesystem/resource conventions. */
    slug?: string | null;
    /** Arbitrary sidecar metadata map. */
    metadata?: Record<string, unknown>;
    /** Text content loaded from `content.txt`. */
    plaintext: string;
}

/**
 * Success payload returned by {@link POST}.
 */
interface LoadProjectSuccessResponse {
    /** Parsed project model from `project.json`. */
    project: Project;
    /** Folder descriptor objects loaded from `folders/<slug>/folder.json`. */
    folders: unknown[];
    /** Resource entries assembled from sidecars + plaintext files. */
    resources: LoadedResource[];
}

/**
 * Error payload returned by {@link POST} on failure.
 */
interface LoadProjectErrorResponse {
    /** Human-readable error summary. */
    error: string;
    /** Underlying error detail message for diagnostics. */
    details: string;
}

/**
 * Loads a project and related entities from the local filesystem.
 *
 * Processing flow:
 * - Parses request JSON and reads `project.json` at `projectPath`.
 * - Reads folder descriptors under `folders/<slug>/folder.json`.
 * - Reads metadata files under `meta/`, then loads matching sidecar and
 *   `resources/<id>/content.txt` payload.
 * - Returns a JSON payload containing `project`, `folders`, and `resources`.
 *
 * @param req - Next.js request containing `{ projectPath }` JSON body.
 * @returns JSON response with project data on success, or error payload with
 *   HTTP 500 on failure.
 *
 * @example
 * const res = await fetch("/api/project", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({ projectPath: "/tmp/my-project" }),
 * });
 * const data = await res.json();
 */
export async function POST(
    req: NextRequest,
): Promise<
    NextResponse<LoadProjectSuccessResponse | LoadProjectErrorResponse>
> {
    try {
        const body = await req.json();
        const { projectPath } = body as LoadProjectRequestBody;
        const projectFile = await fs.readFile(
            path.join(projectPath, "project.json"),
            { encoding: "utf-8" },
        );
        const project: Project = JSON.parse(projectFile);
        const foldersDir = path.join(projectPath, "folders");
        const metadataDir = path.join(projectPath, "meta");
        const resourcesDir = path.join(projectPath, "resources");

        const folders = await fs.readdir(foldersDir, { recursive: true });
        const folderArr = folders
            .filter((folderName) => !folderName.includes("."))
            .map((folderName) => {
                const folderPath = path.join(
                    foldersDir,
                    folderName,
                    "folder.json",
                );
                const data = fsSync.readFileSync(folderPath, {
                    encoding: "utf-8",
                });
                return JSON.parse(data);
            });
        const metadata = await fs.readdir(metadataDir);
        const resourceArr = metadata
            .filter((metadataName) => metadataName.includes("."))
            .map(async (metadataName) => {
                const sidecar = await readSidecar(
                    projectPath,
                    metadataName
                        .replace("resource-", "")
                        .replace(".meta.json", ""),
                );
                const sidecarId =
                    sidecar && typeof sidecar.id === "string" ? sidecar.id : "";
                const resourceName = `content.txt`;
                const resourcePlaintext = fsSync.readFileSync(
                    path.join(resourcesDir, sidecarId, resourceName),
                    { encoding: "utf-8" },
                );

                return {
                    ...sidecar,
                    plaintext: resourcePlaintext,
                } as LoadedResource;
            });
        const resolvedResourceArr = await Promise.all(resourceArr);
        const f = {
            id: project.id,
            name: project.name,
            rootPath: projectPath,
            folders: folderArr,
            resources: resolvedResourceArr,
        };
        console.log(f);

        return NextResponse.json({
            project,
            folders: folderArr,
            resources: resolvedResourceArr,
        });
    } catch (error) {
        return NextResponse.json(
            {
                error: "Failed to load project",
                details: (error as Error).message,
            },
            { status: 500 },
        );
    }
}
