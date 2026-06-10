/**
 * @module app/api/project/query/evaluate
 *
 * Evaluates an inline query AST against all resources in a project.
 *
 * Route:
 * - `POST /api/project/query/evaluate`
 *
 * Expected body:
 * - `{ projectPath: string, definition: QueryAST }`
 *
 * Success payload:
 * - `{ ids: string[] }` — UUIDs of resources that satisfy the predicate
 *
 * Failure payloads:
 * - `{ error: string, details: string }` with HTTP 400 for invalid input
 * - `{ error: string, details: string }` with HTTP 500 for filesystem errors
 */
import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { QueryASTSchema } from "../../../../../src/lib/models/query-ast";
import type { QueryAST } from "../../../../../src/lib/models/query-ast";
import {
  evaluate,
  EvaluatorNotImplementedError,
  QueryCycleError,
} from "../../../../../src/lib/models/query-evaluator";
import type { EvaluationInput } from "../../../../../src/lib/models/query-evaluator";
import {
  listResourceIds,
  loadBacklinks,
} from "../../../../../src/lib/models/backlinks";
import { readQuery } from "../../../../../src/lib/models/saved-queries";
import { readSidecar } from "../../../../../src/lib/models/sidecar";
import { countWords } from "../../../../../src/lib/word-count";
import { PROJECT_FILENAME } from "../../../../../src/lib/models/project-config";
import type {
  ResourceBase,
  ResourceType,
  MetadataValue,
  ProjectConfig,
  Project,
} from "../../../../../src/lib/models/types";
import type { TextResource } from "../../../../../src/lib/models/types";

// ─── Request / response shapes ────────────────────────────────────────────────

interface EvaluateRequestBody {
  projectPath: string;
  definition: unknown;
}

interface EvaluateSuccessResponse {
  ids: string[];
}

interface ErrorResponse {
  error: string;
  details: string;
}

// ─── Core logic (exported for unit testing) ───────────────────────────────────

/**
 * Build a ResourceBase from raw sidecar data, extracting typed system fields.
 * Fields not present in sidecar fall back to safe defaults.
 */
function sidecarToResourceBase(
  id: string,
  sidecar: Record<string, MetadataValue>,
): ResourceBase {
  const base: ResourceBase = {
    id,
    slug: typeof sidecar.slug === "string" ? sidecar.slug : id,
    name: typeof sidecar.name === "string" ? sidecar.name : "",
    type: (typeof sidecar.type === "string"
      ? sidecar.type
      : "text") as ResourceType,
    folderId: typeof sidecar.folderId === "string" ? sidecar.folderId : null,
    orderIndex: typeof sidecar.orderIndex === "number" ? sidecar.orderIndex : 0,
    createdAt:
      typeof sidecar.createdAt === "string"
        ? sidecar.createdAt
        : new Date(0).toISOString(),
    updatedAt:
      typeof sidecar.updatedAt === "string" ? sidecar.updatedAt : undefined,
    statuses:
      Array.isArray(sidecar.statuses) &&
      (sidecar.statuses as unknown[]).every((s) => typeof s === "string")
        ? (sidecar.statuses as string[])
        : undefined,
  };

  if (base.type === "text" && typeof sidecar.wordCount === "number") {
    (base as TextResource).wordCount = sidecar.wordCount;
  }

  return base;
}

/**
 * Load the full EvaluationInput for a project by reading all sidecars,
 * project config, and the persisted backlink index from disk.
 */
async function loadEvaluationInput(
  projectRoot: string,
): Promise<EvaluationInput> {
  // Load project config
  let config: ProjectConfig = { editorConfig: {} };
  try {
    const raw = await fs.readFile(
      path.join(projectRoot, PROJECT_FILENAME),
      "utf8",
    );
    const project = JSON.parse(raw) as Project;
    if (project.config) config = project.config;
  } catch {
    // proceed with empty config
  }

  const backlinks = await loadBacklinks(projectRoot);
  const resourceIds = await listResourceIds(projectRoot);

  const resources: ResourceBase[] = [];
  const sidecars: Record<string, Record<string, MetadataValue>> = {};

  for (const id of resourceIds) {
    const rawSidecar = await readSidecar(projectRoot, id);
    if (!rawSidecar) continue;
    // User metadata fields are nested under userMetadata in the JSON.
    // Flatten them into the top level so the evaluator can look them up by key.
    const userMeta = rawSidecar.userMetadata;
    const sidecar =
      userMeta !== null &&
      typeof userMeta === "object" &&
      !Array.isArray(userMeta)
        ? { ...rawSidecar, ...(userMeta as Record<string, MetadataValue>) }
        : rawSidecar;
    sidecars[id] = sidecar;

    const resource = sidecarToResourceBase(id, rawSidecar);
    // content.txt is the source of truth for word/char counts. The sidecar's
    // cached wordCount can be missing or stale — a content-only save via
    // POST /resource/<id>/content rewrites content.txt without touching the
    // sidecar — so derive the counts here rather than trusting the sidecar.
    // Otherwise wordCount / charCount predicates silently match nothing.
    if (resource.type === "text") {
      try {
        const plain = await fs.readFile(
          path.join(projectRoot, "resources", id, "content.txt"),
          "utf8",
        );
        (resource as TextResource).wordCount = countWords(plain);
        (resource as TextResource).charCount = plain.length;
      } catch {
        // No readable content.txt (e.g. a brand-new stub) — fall back to the
        // sidecar-derived value from sidecarToResourceBase.
      }
    }
    resources.push(resource);
  }

  const resolveRef = async (id: string): Promise<QueryAST | null> => {
    const saved = await readQuery(projectRoot, id);
    return saved !== null ? (saved.definition as QueryAST) : null;
  };

  return { resources, sidecars, context: { config, backlinks }, resolveRef };
}

/**
 * Evaluate a query AST against all resources in `projectRoot` and return the
 * UUIDs of matching resources. Exported for unit testing.
 */
export async function executeEvaluate(
  projectRoot: string,
  ast: QueryAST,
): Promise<string[]> {
  const input = await loadEvaluationInput(projectRoot);
  return evaluate(ast, input);
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
): Promise<NextResponse<EvaluateSuccessResponse | ErrorResponse>> {
  let body: EvaluateRequestBody;
  try {
    body = (await req.json()) as EvaluateRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request", details: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  if (!body.projectPath || !body.definition) {
    return NextResponse.json(
      {
        error: "Invalid request",
        details: "Body must include projectPath and definition",
      },
      { status: 400 },
    );
  }

  const parseResult = QueryASTSchema.safeParse(body.definition);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid query AST", details: parseResult.error.message },
      { status: 400 },
    );
  }

  try {
    const ids = await executeEvaluate(
      body.projectPath,
      parseResult.data as QueryAST,
    );
    return NextResponse.json({ ids });
  } catch (err: unknown) {
    if (err instanceof EvaluatorNotImplementedError) {
      return NextResponse.json(
        { error: "Query feature not implemented", details: err.message },
        { status: 400 },
      );
    }
    if (err instanceof QueryCycleError) {
      return NextResponse.json(
        { error: "Cycle detected in saved-query refs", details: err.message },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "Evaluation failed";
    return NextResponse.json(
      { error: "Query evaluation failed", details: message },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
