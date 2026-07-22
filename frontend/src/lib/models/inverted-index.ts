import path from "node:path";
import { atomicWriteFile, mkdir, readFile, readdir } from "./io";
import { withMetaLock } from "./meta-locks";
import type { TextResource } from "./types";
import { tiptapToPlainText, loadResourceContent } from "../tiptap-utils";

export type InvertedIndex = Record<string, Record<string, number>>;

const INDEX_DIR = "meta/index";
const INDEX_FILE = "inverted.json";

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "nor",
  "so",
  "yet",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "that",
  "this",
  "these",
  "those",
  "as",
  "if",
  "it",
  "its",
  "not",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((t) => !STOP_WORDS.has(t));
}

async function ensureIndexDir(projectRoot: string) {
  await mkdir(path.join(projectRoot, INDEX_DIR), { recursive: true });
}

async function loadIndex(projectRoot: string): Promise<InvertedIndex> {
  const p = path.join(projectRoot, INDEX_DIR, INDEX_FILE);
  try {
    const raw = await readFile(p, "utf8");
    return JSON.parse(raw) as InvertedIndex;
  } catch {
    return {};
  }
}

async function saveIndex(projectRoot: string, index: InvertedIndex) {
  await ensureIndexDir(projectRoot);
  const p = path.join(projectRoot, INDEX_DIR, INDEX_FILE);
  await withMetaLock(projectRoot, async () => {
    await atomicWriteFile(p, JSON.stringify(index, null, 2), {
      writeOptions: "utf8",
      durable: process.env.GETWRITE_DURABLE_META === "1",
    });
  });
}

/** Remove any existing occurrences of resourceId from the index (helper). */
function purgeTermsForResource(index: InvertedIndex, resourceId: string) {
  for (const term of Object.keys(index)) {
    const posting = index[term];
    if (posting[resourceId] !== undefined) {
      delete posting[resourceId];
      if (Object.keys(posting).length === 0) delete index[term];
    }
  }
}

// Title terms are weighted above body terms so a resource named "Dragon Knight"
// reliably ranks above one that merely mentions those words in passing.
const TITLE_BOOST = 10;

/** Resolve a resource's body text: prefer in-memory fields, fall back to persisted content. */
async function resolveBodyText(
  projectRoot: string,
  res: TextResource,
): Promise<string> {
  if (res.plainText) return res.plainText;
  if (res.tiptap) return tiptapToPlainText(res.tiptap);
  try {
    const loaded = await loadResourceContent(projectRoot, res.id);
    if (loaded.plainText) return loaded.plainText;
    if (loaded.tiptap) return tiptapToPlainText(loaded.tiptap);
  } catch {
    // persisted content unreadable — index with title only
  }
  return "";
}

/** Index a resource's plain text into the project's inverted index. */
export async function indexResource(projectRoot: string, res: TextResource) {
  const index = await loadIndex(projectRoot);

  // Remove previous entries for resource
  purgeTermsForResource(index, res.id);

  const text = await resolveBodyText(projectRoot, res);
  const counts: Record<string, number> = {};

  // Title terms with boost (applied even when body text is empty).
  for (const t of tokenize(res.name ?? "")) {
    counts[t] = (counts[t] ?? 0) + TITLE_BOOST;
  }

  // Body terms at normal weight.
  for (const t of tokenize(text)) {
    counts[t] = (counts[t] ?? 0) + 1;
  }

  if (Object.keys(counts).length === 0) {
    await saveIndex(projectRoot, index);
    return;
  }

  for (const [t, c] of Object.entries(counts)) {
    index[t] = index[t] ?? {};
    index[t][res.id] = (index[t][res.id] ?? 0) + c;
  }

  await saveIndex(projectRoot, index);
}

/** Remove a resource from the index fully. */
export async function removeResourceFromIndex(
  projectRoot: string,
  resourceId: string,
) {
  const index = await loadIndex(projectRoot);
  purgeTermsForResource(index, resourceId);
  await saveIndex(projectRoot, index);
}

/**
 * Search the inverted index for a query string and return ranked resource ids.
 * Simple ranking: sum of term frequencies for query terms.
 */
export async function search(
  projectRoot: string,
  query: string,
): Promise<string[]> {
  const index = await loadIndex(projectRoot);
  const terms = tokenize(query);
  const scores: Record<string, number> = {};
  const termHits: Record<string, Record<string, number>> = {};

  for (const t of terms) {
    const posting = index[t];
    termHits[t] = {};
    if (!posting) continue;
    for (const [rid, freq] of Object.entries(posting)) {
      scores[rid] = (scores[rid] ?? 0) + freq;
      termHits[t][rid] = freq;
    }
  }

  // For multi-term queries require all terms to be present (AND semantics).
  // Single-term queries keep the full scored set (OR semantics not needed).
  const qualifiedIds =
    terms.length > 1
      ? Object.keys(scores).filter((rid) =>
          terms.every((t) => (termHits[t]?.[rid] ?? 0) > 0),
        )
      : Object.keys(scores);

  const firstTerm = terms[0];
  return qualifiedIds.sort((a, b) => {
    const scoreA = scores[a] ?? 0;
    const scoreB = scores[b] ?? 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    // tie-break: prefer higher frequency for first query term
    if (firstTerm) {
      const fa = termHits[firstTerm]?.[a] ?? 0;
      const fb = termHits[firstTerm]?.[b] ?? 0;
      if (fb !== fa) return fb - fa;
    }
    // final deterministic tie-break: lexicographic id
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

const SIDECAR_RE =
  /^resource-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.meta\.json$/i;

/**
 * Enqueues any resource that has a sidecar file but is absent from the
 * inverted index. Returns the number of resources newly queued.
 * Safe to call repeatedly — already-indexed resources are skipped.
 */
export async function reindexMissingResources(
  projectRoot: string,
): Promise<number> {
  const metaDir = path.join(projectRoot, "meta");
  let entries: string[];
  try {
    entries = await readdir(metaDir);
  } catch {
    return 0;
  }

  const index = await loadIndex(projectRoot);
  const indexedIds = new Set(Object.values(index).flatMap(Object.keys));

  const { enqueueIndex } = await import("./indexer-queue");
  let queued = 0;

  for (const entry of entries) {
    const match = SIDECAR_RE.exec(entry);
    if (!match) continue;
    const resourceId = match[1]!;
    if (!indexedIds.has(resourceId)) {
      void enqueueIndex(projectRoot, resourceId);
      queued++;
    }
  }

  return queued;
}

const invertedIndex = {
  indexResource,
  removeResourceFromIndex,
  search,
  reindexMissingResources,
};
export default invertedIndex;
