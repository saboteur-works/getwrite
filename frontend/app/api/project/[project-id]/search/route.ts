/**
 * @module app/api/project/[project-id]/search/route
 *
 * Full-text search over the indexed resources of a single project.
 *
 * Route:
 * - `GET /api/project/[project-id]/search`
 *
 * GET query params:
 * - `q`      (required) — search query string
 * - `folder` (optional) — filter by folder ID; only resources in this folder are returned
 * - `status` (optional) — filter by status string; resource must have this status in its `statuses` array
 * - `tags`   (optional) — comma-separated tag IDs; resource must have at least one matching tag
 *
 * Success payload: `SearchResult[]` ordered by proximity score (multi-term) or term frequency (single-term)
 * Failure payload: `{ error: string }`
 */
import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { search, tokenize } from "../../../../../src/lib/models/inverted-index";
import { computeProximityScore } from "../../../../../src/lib/models/search-scoring";
import { readSidecar } from "../../../../../src/lib/models/sidecar";
import type { MetadataValue } from "../../../../../src/lib/models/types";
import {
  getCanonicalRevision,
  revisionDir,
} from "../../../../../src/lib/models/revision";
import { resolveProjectsDir } from "../../../../../src/lib/models/projects-dir";
import { getUserPreferencesFromProjectMetadata } from "../../../../../src/lib/user-preferences";
import { extractSnippet } from "../../../../../src/lib/models/search-snippet";
import { tiptapToPlainText } from "../../../../../src/lib/tiptap-utils";
import type { Project } from "../../../../../src/lib/models/types";

const DEFAULT_RESULT_LIMIT = 50;
const SNIPPET_MAX_LEN = 160;
// Maximum candidates scored for proximity before applying filters + limit.
// Caps content loading for very broad multi-term queries on large projects.
const PROXIMITY_CANDIDATE_LIMIT = 200;

// --- Types ---

export interface SearchResult {
  resourceId: string;
  title: string;
  snippet: string;
  status: string | null;
  folderId: string | null;
  tags: string[];
}

interface SearchFilters {
  folder?: string;
  status?: string;
  tags?: string[];
}

interface ErrorResponse {
  error: string;
}

type SidecarData = Awaited<ReturnType<typeof readSidecar>>;

interface ScoredCandidate {
  id: string;
  text: string | null;
  sidecar: SidecarData;
  proxScore: number;
  rank: number;
}

// --- Internal helpers ---

async function findProjectRoot(
  projectsDir: string,
  projectId: string,
): Promise<string | null> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(projectsDir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(projectsDir, entry.name);
    try {
      const raw = await fs.readFile(
        path.join(candidate, "project.json"),
        "utf8",
      );
      const parsed = JSON.parse(raw) as { id?: string };
      if (parsed?.id === projectId) return candidate;
    } catch {
      // skip unreadable or non-project directories
    }
  }

  return null;
}

async function loadCanonicalText(
  projectRoot: string,
  resourceId: string,
): Promise<string> {
  const canonical = await getCanonicalRevision(projectRoot, resourceId);
  if (!canonical) return "";

  const contentPath = path.join(
    revisionDir(projectRoot, resourceId, canonical.versionNumber),
    "content.bin",
  );

  let text: string;
  try {
    text = await fs.readFile(contentPath, "utf8");
  } catch {
    return "";
  }

  if (text.trimStart().startsWith("{")) {
    try {
      text = tiptapToPlainText(JSON.parse(text));
    } catch {
      // fall through — treat the raw string as plain text
    }
  }

  return text;
}

async function loadTagAssignments(
  projectRoot: string,
): Promise<Record<string, string[]>> {
  // Load tag assignments from project.json (tags live in project config, not sidecars).
  try {
    const raw = await fs.readFile(
      path.join(projectRoot, "project.json"),
      "utf8",
    );
    const project = JSON.parse(raw) as Project;
    return project.config?.tagAssignments ?? {};
  } catch {
    // proceed without tag data
    return {};
  }
}

// For multi-term queries, preload canonical text and sidecar for all
// candidates (up to PROXIMITY_CANDIDATE_LIMIT), then re-rank by how
// closely the query terms appear together. The title is included in the
// proximity text so that a resource named "Dragon Knight" scores as a
// tight phrase match even when the body is sparse. Within equal proximity
// scores the original term-freq rank is preserved as a tiebreaker.
async function scoreMultiTermCandidates(
  projectRoot: string,
  rankedIds: string[],
  terms: string[],
): Promise<ScoredCandidate[]> {
  const cap = Math.min(rankedIds.length, PROXIMITY_CANDIDATE_LIMIT);
  const candidates: ScoredCandidate[] = [];
  for (let i = 0; i < cap; i++) {
    const id = rankedIds[i]!;
    const [text, sidecar] = await Promise.all([
      loadCanonicalText(projectRoot, id),
      readSidecar(projectRoot, id),
    ]);
    const title = typeof sidecar?.name === "string" ? sidecar.name : "";
    const textForProximity = title ? `${title}\n${text}` : text;
    candidates.push({
      id,
      text,
      sidecar,
      proxScore: computeProximityScore(textForProximity, terms),
      rank: i,
    });
  }
  candidates.sort((a, b) =>
    b.proxScore !== a.proxScore ? b.proxScore - a.proxScore : a.rank - b.rank,
  );
  return candidates;
}

// --- Core search logic (exported for testing) ---

export async function executeSearch(
  projectRoot: string,
  query: string,
  filters: SearchFilters,
  limit: number,
): Promise<SearchResult[]> {
  const tagAssignments = await loadTagAssignments(projectRoot);

  const terms = tokenize(query);
  const rankedIds = await search(projectRoot, query);

  const candidates: ScoredCandidate[] =
    terms.length > 1
      ? await scoreMultiTermCandidates(projectRoot, rankedIds, terms)
      : rankedIds.map((id, rank) => ({
          id,
          text: null,
          sidecar: null,
          proxScore: 0,
          rank,
        }));

  const results: SearchResult[] = [];

  for (const candidate of candidates) {
    if (results.length >= limit) break;

    const sidecar =
      candidate.sidecar ?? (await readSidecar(projectRoot, candidate.id));

    const title =
      typeof sidecar?.name === "string" ? sidecar.name : candidate.id;
    const userMetadata = sidecar?.userMetadata as
      | Record<string, MetadataValue>
      | undefined;
    const status =
      typeof userMetadata?.status === "string" ? userMetadata.status : null;
    const folderId =
      typeof sidecar?.folderId === "string" ? sidecar.folderId : null;
    const resourceTags: string[] = tagAssignments[candidate.id] ?? [];

    // Apply filters — all active filters must match.
    if (filters.folder !== undefined && folderId !== filters.folder) continue;
    if (filters.status !== undefined && status !== filters.status) continue;
    if (
      filters.tags !== undefined &&
      filters.tags.length > 0 &&
      !filters.tags.some((t) => resourceTags.includes(t))
    )
      continue;

    // Reuse preloaded text for multi-term queries; load on demand for single-term.
    const text =
      candidate.text ?? (await loadCanonicalText(projectRoot, candidate.id));
    const snippet = extractSnippet(text, query, SNIPPET_MAX_LEN);

    results.push({
      resourceId: candidate.id,
      title,
      snippet,
      status,
      folderId,
      tags: resourceTags,
    });
  }

  return results;
}

// --- Route handler ---

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ "project-id": string }> },
): Promise<NextResponse<SearchResult[] | ErrorResponse>> {
  const projectId = (await params)["project-id"];
  const { searchParams } = new URL(req.url);

  const q = searchParams.get("q");
  if (!q || q.trim() === "") {
    return NextResponse.json(
      { error: "Missing required query param: q." },
      { status: 400 },
    );
  }

  const folder = searchParams.get("folder") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const tagsParam = searchParams.get("tags");
  const tags = tagsParam
    ? tagsParam
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : undefined;

  const projectsDir = resolveProjectsDir();
  const projectRoot = await findProjectRoot(projectsDir, projectId);

  if (!projectRoot) {
    return NextResponse.json(
      { error: `Project ${projectId} not found.` },
      { status: 404 },
    );
  }

  let limit = DEFAULT_RESULT_LIMIT;
  try {
    const raw = await fs.readFile(
      path.join(projectRoot, "project.json"),
      "utf8",
    );
    const project = JSON.parse(raw) as Project;
    const prefs = getUserPreferencesFromProjectMetadata(project.metadata);
    if (prefs.searchResultLimit !== undefined) {
      limit = prefs.searchResultLimit;
    }
  } catch {
    // use default limit
  }

  try {
    const results = await executeSearch(
      projectRoot,
      q.trim(),
      { folder, status, tags },
      limit,
    );
    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
