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
  TextResource,
} from "../../../../../src/lib/models/types";

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

function str(v: MetadataValue): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: MetadataValue): number | undefined {
  return typeof v === "number" ? v : undefined;
}

function stringArray(v: MetadataValue): string[] | undefined {
  return Array.isArray(v) &&
    (v as unknown[]).every((s) => typeof s === "string")
    ? (v as string[])
    : undefined;
}

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
    slug: str(sidecar.slug) ?? id,
    name: str(sidecar.name) ?? "",
    type: (str(sidecar.type) ?? "text") as ResourceType,
    folderId: str(sidecar.folderId) ?? null,
    orderIndex: num(sidecar.orderIndex) ?? 0,
    createdAt: str(sidecar.createdAt) ?? new Date(0).toISOString(),
    updatedAt: str(sidecar.updatedAt),
    statuses: stringArray(sidecar.statuses),
  };

  if (base.type === "text" && num(sidecar.wordCount) !== undefined) {
    (base as TextResource).wordCount = num(sidecar.wordCount)!;
  }

  return base;
}

async function loadProjectConfig(projectRoot: string): Promise<ProjectConfig> {
  try {
    const raw = await fs.readFile(
      path.join(projectRoot, PROJECT_FILENAME),
      "utf8",
    );
    const project = JSON.parse(raw) as Project;
    return project.config ?? { editorConfig: {} };
  } catch {
    // proceed with empty config
    return { editorConfig: {} };
  }
}

function flattenUserMetadata(
  rawSidecar: Record<string, MetadataValue>,
): Record<string, MetadataValue> {
  // User metadata fields are nested under userMetadata in the JSON.
  // Flatten them into the top level so the evaluator can look them up by key.
  const userMeta = rawSidecar.userMetadata;
  return userMeta !== null &&
    typeof userMeta === "object" &&
    !Array.isArray(userMeta)
    ? { ...rawSidecar, ...(userMeta as Record<string, MetadataValue>) }
    : rawSidecar;
}

async function deriveTextCounts(
  projectRoot: string,
  id: string,
  resource: ResourceBase,
): Promise<void> {
  // content.txt is the source of truth for word/char counts. The sidecar's
  // cached wordCount can be missing or stale — a content-only save via
  // POST /resource/<id>/content rewrites content.txt without touching the
  // sidecar — so derive the counts here rather than trusting the sidecar.
  // Otherwise wordCount / charCount predicates silently match nothing.
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

/**
 * Load the full EvaluationInput for a project by reading all sidecars,
 * project config, and the persisted backlink index from disk.
 */
async function loadEvaluationInput(
  projectRoot: string,
): Promise<EvaluationInput> {
  const [config, backlinks, resourceIds] = await Promise.all([
    loadProjectConfig(projectRoot),
    loadBacklinks(projectRoot),
    listResourceIds(projectRoot),
  ]);

  const resources: ResourceBase[] = [];
  const sidecars: Record<string, Record<string, MetadataValue>> = {};

  for (const id of resourceIds) {
    const rawSidecar = await readSidecar(projectRoot, id);
    if (!rawSidecar) continue;

    sidecars[id] = flattenUserMetadata(rawSidecar);

    const resource = sidecarToResourceBase(id, rawSidecar);
    if (resource.type === "text") {
      await deriveTextCounts(projectRoot, id, resource);
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
