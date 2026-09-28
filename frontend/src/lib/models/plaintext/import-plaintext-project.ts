// Last Updated: 2026-09-28

/**
 * @module import-plaintext-project
 *
 * The single model-layer entry point for the plain-text importer (Task 5,
 * `specs/features/plain-text-import.md` FR-2 through FR-10): ties the
 * source-detection/folder-walk module (Task 2), the plain-text-to-TipTap
 * converter (Task 3), and the report builder (Task 4) together into one call
 * that produces a complete, valid destination GetWrite project.
 *
 * This module mirrors `docx/import-docx-project.ts`'s orchestration order,
 * error-signaling convention, and fatal-error cleanup convention almost
 * exactly, simplified for plain text's much smaller surface: there is no
 * project-type option, no heading split, and no rich-content report
 * categories (comments/tracked-changes/images/footnotes) to fold in.
 *
 * ## Error-signaling convention
 *
 * {@link importPlainTextProject} throws
 * {@link PlainTextDestinationNotEmptyError} for FR-5's refusal case. This is
 * this module's own class, not a reuse of `import-docx-project.ts`'s
 * `DocxDestinationNotEmptyError` or `import-scrivener-project.ts`'s
 * `DestinationNotEmptyError` (Stage 6.5 precedent): the underlying refused
 * condition is the same generic "destination already exists and is not
 * empty" check, but each importer's message is worded for the format it
 * imports and must not be surfaced verbatim by a different importer.
 *
 * {@link NoTxtFilesFoundError} (`./source-detection`) is allowed to propagate
 * unwrapped for FR-4's refusal case — it is not caught and rewrapped here.
 *
 * ## Orchestration order
 *
 * 1. Refuse a non-empty pre-existing `projectRoot` (FR-5) — before any write.
 * 2. Auto-detect whether `sourcePath` is a single `.txt` file or a directory
 *    (Task 2's `detectPlainTextSource`; also refuses, before any write, a
 *    directory with no `.txt` file anywhere in its tree, FR-4).
 * 3. Plan (pure, no destination writes yet): for a folder source, walk it
 *    into an ordered file/folder plan (Task 2). A single-file source needs no
 *    separate planning step beyond reading the one file.
 * 4. Create the destination `project.json`, named from the resolved title
 *    (an explicit `name`, else the single file's basename without its `.txt`
 *    extension, else the source folder's own basename), seeded with the
 *    `"blank"` project type's `statuses`/`relationshipTypes` (no
 *    project-type option is in scope for this feature).
 * 5. Create every resource: one for the single file (FR-6) or one per walked
 *    `.txt` file plus mirrored folders (folder source, FR-2), via the
 *    bulk-create pattern (`writeResourceToFile` + `writeRevision(...,
 *    { isCanonical: true })`, FR-9).
 * 6. Write the Task 4 FR-7 report.
 * 7. Rebuild the destination project's inverted index, backlinks, and entity
 *    mention index from scratch, mirroring `import-docx-project.ts`'s own
 *    from-scratch rebuild call at the end of its write phase.
 * 8. Append exactly one writing-log entry (FR-8), tagged `source:
 *    "plaintext"`, written last — after the index rebuild.
 *
 * No step above ever writes to, renames, or deletes anything under
 * `sourcePath` — every read of the source uses `io.ts`'s read-only wrappers
 * (`readFile`/`readdir`/`stat`), never a mutating one.
 *
 * ## Destination cleanup on fatal error
 *
 * Before any destination write, whether `projectRoot` already exists is
 * checked once and recorded; a `projectRoot` that already exists and is
 * non-empty is refused immediately via
 * {@link PlainTextDestinationNotEmptyError} — nothing is written. The write
 * phase (steps 4-8) runs inside a single `try`/`catch`: any fatal error is
 * re-thrown annotated with which phase it failed in, and — only when the
 * recorded flag says `projectRoot` did not exist before this run —
 * `projectRoot` is removed entirely via `rm(projectRoot, { recursive: true,
 * force: true })` first. A `projectRoot` that already existed (necessarily
 * empty, since a non-empty one is refused above) is always left untouched.
 * This mirrors `import-docx-project.ts`'s/`import-scrivener-project.ts`'s own
 * cleanup rule exactly.
 *
 * ## No leftover indexing
 *
 * The whole write phase runs inside {@link withIndexingSuspended}
 * (`indexer-queue.ts`), so every `enqueueIndex` call `writeSidecar` makes
 * during this run is a genuine no-op; the only indexing work this run ever
 * performs is the final rebuild-from-scratch pass, mirroring
 * `import-docx-project.ts`'s own convention.
 *
 * ## FR-10 (fail-closed on a locked/keyless destination)
 *
 * Needs no new code here — it is inherited for free from the
 * `writeResourceToFile`/`writeRevision`/storage-adapter write path, the same
 * reason neither the DOCX nor Scrivener orchestrator has a dedicated FR-10
 * implementation of its own.
 *
 * This orchestrator deliberately does **not** call `runForTenant` itself,
 * for the same reason `import-docx-project.ts`/`import-scrivener-project.ts`
 * do not — its callers (the CLI, tests) do.
 */
import path from "node:path";
import { exists, mkdir, readFile, readdir, rm, writeFile } from "../io";
import { createProject } from "../project";
import { createFolderResource, createTextResource } from "../resource-factory";
import { writeResourceToFile } from "../resource-persistence";
import { writeRevision } from "../revision";
import { appendWritingLogEntry } from "../writing-log";
import { countWords } from "../../word-count";
import { withIndexingSuspended } from "../indexer-queue";
import { readSidecar } from "../sidecar";
import {
  listResourceIds,
  computeBacklinks,
  persistBacklinks,
} from "../backlinks";
import { indexResource } from "../inverted-index";
import { buildEntityAliasTable } from "../entity-alias-table";
import { findMentionOffsets } from "../entity-detection";
import {
  persistMentionIndex,
  type MentionIndex,
  type MentionRecord,
} from "../mention-index";
import { loadResourceContent } from "../../tiptap-utils";
import { slugify } from "../../utils";
import { getProjectType } from "../../projectTypes";
import type { Project, TextResource, UUID } from "../types";
import {
  buildPlainTextImportReport,
  writePlainTextImportReport,
  type PlainTextImportReportInput,
  type PlainTextImportReportNamingNote,
} from "./plaintext-import-report";
import {
  detectPlainTextSource,
  walkPlainTextFolder,
  type PlainTextFolderSkipCounts,
  type PlainTextFolderWalkPlan,
  type PlainTextWalkEntry,
} from "./source-detection";
import {
  convertPlainTextToTiptap,
  type PlainTextTipTapDocument,
} from "./txt-to-tiptap";

/**
 * Thrown by {@link importPlainTextProject} per FR-5 when `projectRoot`
 * already exists and is non-empty. Raised before any destination write —
 * nothing is created, written, or removed. Plain-text-specific wording
 * (Stage 6.5 precedent): unlike `import-docx-project.ts`'s
 * `DocxDestinationNotEmptyError` or `import-scrivener-project.ts`'s
 * `DestinationNotEmptyError`, this message never mentions DOCX or Scrivener.
 */
export class PlainTextDestinationNotEmptyError extends Error {
  constructor(projectRoot: string) {
    super(
      `Cannot import plain-text project: destination "${projectRoot}" ` +
        `already exists and is not empty. Choose an empty or non-existent ` +
        `destination.`,
    );
    this.name = "PlainTextDestinationNotEmptyError";
  }
}

/** Default destination project type — no `--project-type` option is in scope for this feature. */
const DEFAULT_PROJECT_TYPE = "blank";

/** Zero-valued {@link PlainTextFolderSkipCounts}, used for a single-file source (which never walks a folder). */
const ZERO_FOLDER_SKIP_COUNTS: PlainTextFolderSkipCounts = {
  nonTxtFilesSkippedCount: 0,
  hiddenFilesSkippedCount: 0,
};

/** Input to {@link importPlainTextProject}. */
export interface ImportPlainTextProjectOptions {
  /** Absolute path to the source: either a single `.txt` file or a directory containing one or more `.txt` files (FR-2, FR-3). */
  sourcePath: string;
  /** Absolute path where the new destination GetWrite project should be created. */
  projectRoot: string;
  /** Optional destination project name; see the module doc's per-source-shape naming rules for the default. */
  name?: string;
}

/** Result of a successful {@link importPlainTextProject} run. */
export interface ImportPlainTextProjectResult {
  /** The created destination project. */
  readonly project: Project;
  /** Absolute path to the created destination project. */
  readonly projectRoot: string;
  /** Number of folders created (folder source only; always `0` for a single-file source). */
  readonly folderCount: number;
  /** Number of text resources created. */
  readonly resourceCount: number;
  /** Rendered FR-7 report text (already persisted via `writePlainTextImportReport`). */
  readonly report: string;
}

/**
 * The module doc's "Orchestration order" list (steps 4-8; steps 1-3 run
 * before any destination write and cannot trigger the fatal-error cleanup
 * below), used to label which phase a fatal write-phase error occurred in.
 */
const ORCHESTRATION_PHASES = [
  "4. Create the destination project.json",
  "5. Create every resource (and, for a folder source, every mirrored folder)",
  "6. Write the FR-7 report",
  "7. Rebuild the destination project's indexes",
] as const;

/** Mutable accumulator threaded through resource creation, folded into the FR-7 report at the end. */
interface ReportAccumulator {
  filesProcessedCount: number;
  namingNotes: PlainTextImportReportNamingNote[];
}

function newReportAccumulator(): ReportAccumulator {
  return { filesProcessedCount: 0, namingNotes: [] };
}

/**
 * Resolves the `"blank"` destination project type's seed
 * (`statuses`/`relationshipTypes`), mirroring
 * `import-docx-project.ts`'s `resolveProjectTypeSeed` but with no option to
 * choose a different one — this feature has no `--project-type` option.
 */
async function resolveDefaultProjectTypeSeed(): Promise<{
  statuses?: string[];
  relationshipTypes?: string[];
}> {
  const entry = await getProjectType(DEFAULT_PROJECT_TYPE);
  if (entry === undefined) {
    // The "blank" project type ships with the repo; this should be
    // unreachable in practice, but fail loudly rather than silently
    // seeding nothing if it is ever removed/renamed.
    throw new Error(
      `Cannot import plain-text project: the default project type ` +
        `"${DEFAULT_PROJECT_TYPE}" is missing its spec.`,
    );
  }
  return {
    statuses: entry.spec.statuses,
    relationshipTypes: entry.spec.relationshipTypes,
  };
}

/** `name` without its trailing `.txt` extension (case-insensitive), used for a resource's default title (FR-6). */
function stripTxtExtension(name: string): string {
  return path.basename(name, path.extname(name));
}

/**
 * Creates and persists one text resource from an already-converted
 * `PlainTextTipTapDocument`, via the bulk-create pattern
 * (`writeResourceToFile` + `writeRevision(..., { isCanonical: true })`).
 */
async function createAndWritePlainTextResource(
  projectRoot: string,
  params: {
    name: string;
    folderId: UUID | null;
    document: PlainTextTipTapDocument;
    plainText: string;
    orderIndex: number;
  },
): Promise<TextResource> {
  const resource = createTextResource({
    name: params.name,
    folderId: params.folderId,
    plainText: params.plainText,
    tiptap: params.document,
    orderIndex: params.orderIndex,
  });

  await writeResourceToFile(projectRoot, resource);
  await writeRevision(
    projectRoot,
    resource.id,
    1,
    JSON.stringify(resource.tiptap),
    { isCanonical: true },
  );

  return resource;
}

/**
 * Recursively creates resources/folders from a Task 2 folder-walk plan
 * (FR-2): one resource per `.txt` file, mirroring subfolders as GetWrite
 * folders in the walk's own order (never re-sorted here).
 */
async function writeFolderEntries(
  projectRoot: string,
  entries: readonly PlainTextWalkEntry[],
  parentFolderId: UUID | null,
  acc: ReportAccumulator,
  counts: { folderCount: number; resourceCount: number },
): Promise<void> {
  let orderIndex = 0;
  for (const entry of entries) {
    if (entry.kind === "folder") {
      const folderResource = createFolderResource({
        name: entry.name,
        parentFolderId,
        orderIndex: orderIndex++,
      });
      await writeResourceToFile(projectRoot, folderResource);
      counts.folderCount += 1;
      await writeFolderEntries(
        projectRoot,
        entry.entries,
        folderResource.id,
        acc,
        counts,
      );
      continue;
    }

    const rawContent = await readFile(entry.path, "utf8");
    const document = convertPlainTextToTiptap(rawContent);
    const resourceName = stripTxtExtension(entry.name);

    await createAndWritePlainTextResource(projectRoot, {
      name: resourceName,
      folderId: parentFolderId,
      document,
      plainText: rawContent,
      orderIndex: orderIndex++,
    });
    counts.resourceCount += 1;
    acc.filesProcessedCount += 1;
  }
}

/**
 * Imports a single `.txt` file or a directory of `.txt` files into a new,
 * complete GetWrite project at `projectRoot` (FR-2 through FR-10).
 *
 * @throws {PlainTextDestinationNotEmptyError} When `projectRoot` already
 *   exists and is non-empty (FR-5). Nothing is written in this case.
 * @throws {NoTxtFilesFoundError} When `sourcePath` is a directory containing
 *   no `.txt` file anywhere in its tree (FR-4). Nothing is written in this
 *   case.
 */
export async function importPlainTextProject(
  options: ImportPlainTextProjectOptions,
): Promise<ImportPlainTextProjectResult> {
  const { sourcePath, projectRoot } = options;

  // FR-5: recorded, once and before any write, whether projectRoot existed
  // before this run — this recorded value (not a later filesystem check) is
  // what "run-created" means for this run's fatal-error cleanup below. A
  // pre-existing, non-empty projectRoot is refused up front, before any
  // write.
  const didProjectRootExistBeforeRun = await exists(projectRoot);
  if (didProjectRootExistBeforeRun) {
    const existingEntries = (await readdir(projectRoot)) as string[];
    if (existingEntries.length > 0) {
      throw new PlainTextDestinationNotEmptyError(projectRoot);
    }
  }

  // FR-4: auto-detect the source shape; refuses a folder with no .txt
  // anywhere beneath it before any write.
  const detected = await detectPlainTextSource(sourcePath);

  // ── Planning (pure; no destination writes yet) ──────────────────────────
  const folderPlan: PlainTextFolderWalkPlan | undefined =
    detected.kind === "directory"
      ? await walkPlainTextFolder(sourcePath)
      : undefined;
  const projectTypeSeed = await resolveDefaultProjectTypeSeed();

  let currentPhase: (typeof ORCHESTRATION_PHASES)[number] =
    ORCHESTRATION_PHASES[0];
  try {
    return await withIndexingSuspended(async () => runWritePhase());
  } catch (err) {
    const originalMessage = err instanceof Error ? err.message : String(err);
    const wrapped = new Error(
      `Plain-text import failed during orchestration phase "${currentPhase}": ${originalMessage}`,
      { cause: err },
    );
    if (!didProjectRootExistBeforeRun) {
      await rm(projectRoot, { recursive: true, force: true }).catch(() => {
        // Best-effort cleanup: the original error is what matters to the
        // caller either way.
      });
    }
    throw wrapped;
  }

  async function runWritePhase(): Promise<ImportPlainTextProjectResult> {
    const acc = newReportAccumulator();

    // ── Destination project ────────────────────────────────────────────────
    const projectName =
      options.name ??
      (detected.kind === "file"
        ? stripTxtExtension(path.basename(sourcePath))
        : path.basename(sourcePath));
    const project = createProject({
      name: projectName,
      projectType: DEFAULT_PROJECT_TYPE,
      slug: slugify(projectName),
      rootPath: projectRoot,
      config: {
        editorConfig: {},
        statuses: projectTypeSeed.statuses,
        relationshipTypes: projectTypeSeed.relationshipTypes,
      },
    });
    await mkdir(projectRoot, { recursive: true });
    await writeFile(
      path.join(projectRoot, "project.json"),
      JSON.stringify(project, null, 2),
      "utf8",
    );

    // ── Resources (and, for a folder source, folders) ─────────────────────
    currentPhase = ORCHESTRATION_PHASES[1];
    let folderCount = 0;
    let resourceCount = 0;
    let folderSkipCounts: PlainTextFolderSkipCounts = ZERO_FOLDER_SKIP_COUNTS;

    if (detected.kind === "file") {
      const rawContent = await readFile(sourcePath, "utf8");
      const document = convertPlainTextToTiptap(rawContent);
      const resourceName = stripTxtExtension(path.basename(sourcePath));

      await createAndWritePlainTextResource(projectRoot, {
        name: resourceName,
        folderId: null,
        document,
        plainText: rawContent,
        orderIndex: 0,
      });
      resourceCount = 1;
      acc.filesProcessedCount = 1;
    } else if (folderPlan !== undefined) {
      const counts = { folderCount: 0, resourceCount: 0 };
      await writeFolderEntries(
        projectRoot,
        folderPlan.entries,
        null,
        acc,
        counts,
      );
      folderCount = counts.folderCount;
      resourceCount = counts.resourceCount;
      folderSkipCounts = folderPlan.skips;
    }

    // ── Report (FR-7) ──────────────────────────────────────────────────────
    currentPhase = ORCHESTRATION_PHASES[2];
    const reportInput: PlainTextImportReportInput = {
      filesProcessedCount: acc.filesProcessedCount,
      nonTxtFilesSkippedCount: folderSkipCounts.nonTxtFilesSkippedCount,
      hiddenFilesSkippedCount: folderSkipCounts.hiddenFilesSkippedCount,
      namingNotes: acc.namingNotes,
    };
    const report = buildPlainTextImportReport(reportInput);
    await writePlainTextImportReport(projectRoot, report);

    // ── Rebuild indexes, mirroring cli/src/commands/reindex.ts ────────────
    currentPhase = ORCHESTRATION_PHASES[3];
    const importedWordCount = await rebuildIndexes(projectRoot);

    // Feature 59 FR-3/FR-10: one import entry, written last so the imported
    // words are never also diff-logged (imports write via
    // writeResourceToFile + writeRevision, not updateRevisionInPlace). A
    // failure here reaches the catch above, which removes a run-created
    // projectRoot, so no orphan log.
    await appendWritingLogEntry(projectRoot, {
      added: importedWordCount,
      deleted: 0,
      source: "plaintext",
    });

    return { project, projectRoot, folderCount, resourceCount, report };
  }
}

/**
 * Rebuilds the destination project's inverted index, backlinks, and entity
 * mention index from scratch, mirroring `cli/src/commands/reindex.ts:23-60`
 * (same as `import-docx-project.ts`'s/`import-scrivener-project.ts`'s own
 * rebuild).
 */
export async function rebuildIndexes(projectRoot: string): Promise<number> {
  const resourceIds = await listResourceIds(projectRoot);
  const plainTextById = new Map<string, string | undefined>();

  for (const id of resourceIds) {
    let name = id;
    try {
      const side = await readSidecar(projectRoot, id);
      if (side && (side as Record<string, unknown>).name) {
        name = String((side as Record<string, unknown>).name);
      }
    } catch {
      // no sidecar — use id as name
    }

    let plainText: string | undefined;
    try {
      const loaded = await loadResourceContent(projectRoot, id);
      plainText = loaded.plainText ?? undefined;
    } catch {
      // no content — index will be empty for this resource
    }
    plainTextById.set(id, plainText);

    const minimal: TextResource = {
      id,
      name,
      type: "text",
      folderId: undefined,
      createdAt: new Date().toISOString(),
      plainText,
      tiptap: undefined,
    } as unknown as TextResource;

    await indexResource(projectRoot, minimal);
  }

  const backlinks = await computeBacklinks(projectRoot);
  await persistBacklinks(projectRoot, backlinks);

  const aliasTable = await buildEntityAliasTable(projectRoot);
  const mentionIndex: MentionIndex = {};

  for (const id of resourceIds) {
    const plainText = plainTextById.get(id);
    const records: MentionRecord[] = [];

    for (const entity of Object.values(aliasTable.entities)) {
      const offsets: number[] = [];
      for (const term of entity.terms) {
        offsets.push(...findMentionOffsets(plainText ?? "", term));
      }
      if (offsets.length > 0) {
        offsets.sort((a, b) => a - b);
        records.push({
          entityId: entity.entityId,
          resourceId: id,
          count: offsets.length,
          offsets,
        });
      }
    }

    if (records.length > 0) {
      mentionIndex[id] = records;
    }
  }

  await persistMentionIndex(projectRoot, mentionIndex);
  let totalWords = 0;
  for (const text of plainTextById.values())
    totalWords += countWords(text ?? "");
  return totalWords;
}
