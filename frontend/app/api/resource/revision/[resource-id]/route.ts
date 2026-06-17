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
import {
  readSidecar,
  writeSidecar,
} from "../../../../../src/lib/models/sidecar";
import type { Revision } from "../../../../../src/lib/models/types";
import { persistResourceContent } from "../../../../../src/lib/tiptap-utils";
import type { TipTapDocument } from "../../../../../src/lib/models";

interface GetRevisionResponse {
  revision: Revision;
  content: string;
}

/**
 * When `content` is omitted the handler reads the resource's current saved
 * content from the filesystem.
 */
interface SaveRevisionBody {
  projectPath: string;
  content?: string;
  author?: string;
  isCanonical?: boolean;
  metadata?: Record<string, unknown>;
}

interface DeleteRevisionBody {
  projectPath: string;
  revisionId: string;
}

interface SetCanonicalRevisionBody {
  projectPath: string;
  revisionId: string;
  /** Optional revision content to persist in-place for canonical revisions. */
  content?: string;
}

async function findRevisionById(
  projectPath: string,
  resourceId: string,
  revisionId: string,
): Promise<Revision> {
  const revisions = await listRevisions(projectPath, resourceId);
  const match = revisions.find((r) => r.id === revisionId);
  if (!match) throw new Error(`Revision ${revisionId} not found.`);
  return match;
}

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
 * Best-effort sync of a resource's derived content files from a canonical
 * revision's serialized TipTap content.
 *
 * Compile, export, and the search index read `resources/<id>/content.txt` and
 * `content.tiptap.json` — not the revision's `content.bin`. Rewriting them here
 * keeps them from drifting behind the canonical revision, so newly typed text
 * reaches a compile without first remounting the editor (which previously was
 * the only thing that re-synced these files).
 *
 * Silently no-ops when the content is not a TipTap document (e.g. a legacy
 * plain-text revision); the revision write remains the source of truth then.
 */
async function syncDerivedResourceContent(
  projectPath: string,
  resourceId: string,
  content: string,
): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return;
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { type?: unknown }).type !== "doc"
  ) {
    return;
  }

  await persistResourceContent(
    projectPath,
    resourceId,
    parsed as TipTapDocument,
  );
}

/**
 * Reads the current saved content for a resource from the filesystem.
 *
 * Checks for `content.tiptap.json` first, then falls back to `content.txt`.
 * Returns the raw file contents as a string, or throws if neither file exists.
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
      error instanceof Error ? error.message : "Failed to retrieve revision.";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ "resource-id": string }> },
) {
  const resourceId = (await params)["resource-id"];

  let body: SaveRevisionBody;
  try {
    body = (await req.json()) as SaveRevisionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
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
      { author, isCanonical: isCanonical ?? false, metadata },
    );

    if (isCanonical) {
      await setCanonicalRevision(projectPath, resourceId, versionNumber);
    }

    return NextResponse.json(revision, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save revision.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ "resource-id": string }> },
) {
  const resourceId = (await params)["resource-id"];

  let body: DeleteRevisionBody;
  try {
    body = (await req.json()) as DeleteRevisionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
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
    const revisions = await listRevisions(projectPath, resourceId);
    const target = revisions.find((r) => r.id === revisionId);

    if (!target) {
      return NextResponse.json(
        { error: `Revision ${revisionId} not found.` },
        { status: 404 },
      );
    }

    if (target.isCanonical) {
      return NextResponse.json(
        {
          error:
            "Cannot delete the canonical revision; promote another revision first.",
        },
        { status: 400 },
      );
    }

    const directory = revisionDir(
      projectPath,
      resourceId,
      target.versionNumber,
    );
    await fs.rm(directory, { recursive: true, force: true });

    return NextResponse.json(target, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete revision.";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ "resource-id": string }> },
) {
  const resourceId = (await params)["resource-id"];

  let body: SetCanonicalRevisionBody;
  try {
    body = (await req.json()) as SetCanonicalRevisionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
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
          { error: "Only the canonical revision can be updated in place." },
          { status: 400 },
        );
      }

      await writeRevisionContent(
        projectPath,
        resourceId,
        target.versionNumber,
        content,
      );

      // Keep the derived content files (read by compile/export/search) in sync
      // with the canonical revision so they cannot drift behind the editor.
      await syncDerivedResourceContent(projectPath, resourceId, content);

      const updatedAt = new Date().toISOString();
      const existingSidecar = await readSidecar(projectPath, resourceId);
      await writeSidecar(projectPath, resourceId, {
        ...(existingSidecar ?? {}),
        updatedAt,
      });

      return NextResponse.json({ ...target, updatedAt }, { status: 200 });
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
