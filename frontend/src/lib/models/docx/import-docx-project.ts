// Last Updated: 2026-09-13

/**
 * @module import-docx-project
 *
 * The single model-layer entry point for the DOCX importer (Task 9,
 * `specs/features/docx-importer.md` FR-5, FR-7, FR-8, FR-14): ties the
 * source-detection/folder-walk module (Task 3), the core-properties reader
 * (Task 4), the package-part detector (Task 5), the mammoth-to-TipTap
 * converter (Task 6), the heading-level splitter (Task 7), and the report
 * builder (Task 8) together into one call that produces a complete, valid
 * destination GetWrite project.
 *
 * ## Error-signaling convention
 *
 * {@link importDocxProject} throws {@link DocxDestinationNotEmptyError} for
 * FR-7's refusal case, and a new {@link UnknownProjectTypeError} for FR-8's
 * refusal case. Both are dedicated `Error` subclasses a caller can
 * `instanceof`-check, matching the codebase's existing convention for
 * control-flow-relevant failures (`UnsupportedScrivenerProjectError`,
 * `NoDocxFilesFoundError`, `SameEntityRelationshipError`).
 *
 * {@link DocxDestinationNotEmptyError} is this module's own class rather than
 * a reuse of `import-scrivener-project.ts`'s `DestinationNotEmptyError`
 * (Stage 6.5, 2026-09-13 owner decision, FR-7): although the underlying
 * refused condition is the same generic, format-agnostic
 * "destination already exists and is not empty" check, the Scrivener class's
 * message is worded for a Scrivener import ("Cannot import Scrivener
 * project: …") and must not be surfaced verbatim during a DOCX import. The
 * two classes are otherwise unrelated types — a caller must check for the
 * one that matches the importer it called.
 *
 * ## Orchestration order
 *
 * 1. Resolve and validate the requested project type (FR-8) and refuse a
 *    non-empty pre-existing `projectRoot` (FR-7) — both before any write.
 * 2. Auto-detect whether `sourcePath` is a single `.docx` file or a
 *    directory (Task 3's `detectDocxSource`; also refuses, before any
 *    write, a directory with no `.docx` file anywhere in its tree).
 * 3. Plan (pure, no destination writes yet): for a single-file source, read
 *    its core title/author (Task 4), detect its package features (Task 5),
 *    convert it to TipTap (Task 6), and split it into sections (Task 7); for
 *    a folder source, walk it into an ordered file/folder plan (Task 3).
 * 4. Create the destination `project.json`, named from the resolved title
 *    (single-file) or the source folder's own basename (folder source; both
 *    still overridden by an explicit `name`), seeded with the chosen project
 *    type's `statuses`/`relationshipTypes`.
 * 5. Create every resource: one per section (single-file) or one per walked
 *    `.docx` file plus mirrored folders (folder source; each file
 *    independently read/converted here, never split), via the bulk-create
 *    pattern (`writeResourceToFile` + `writeRevision(..., { isCanonical:
 *    true })`), appending each resource's own Notes list as trailing
 *    paragraphs. A single-file source's resource naming follows FR-14's
 *    no-heading/preamble rule (Stage 6.5, 2026-09-13): when the whole
 *    document has no heading at the split level (or `splitLevel: "none"`),
 *    its one resource is named from the document's own core title, falling
 *    back to the source filename without its `.docx` extension; otherwise
 *    each of Task 7's sections keeps its own resolved name — a real
 *    heading's text unchanged, or `heading-split.ts`'s already-deduplicated
 *    "Untitled"/"Untitled 2"/... placeholder for a section with no heading
 *    of its own (`titleSource: "auto"`), each such placeholder also recorded
 *    for the FR-6(h) report.
 * 6. Create the `docx-import` metadata group's "Author" field (only when at
 *    least one processed document actually had a non-empty core author) and
 *    write each resource's own author onto it.
 * 7. Write the Task 8 FR-6 report.
 * 8. Rebuild the destination project's indexes from scratch, mirroring
 *    `import-scrivener-project.ts`'s own FR-11 rebuild.
 *
 * No step above ever writes to, renames, or deletes anything under
 * `sourcePath` — every read of the source uses `io.ts`'s read-only wrappers
 * (`readFileBuffer`/`readdir`/`stat`/`exists`), never a mutating one.
 *
 * ## Destination cleanup on fatal error
 *
 * Before any destination write, whether `projectRoot` already exists is
 * checked once and recorded; a `projectRoot` that already exists and is
 * non-empty is refused immediately via {@link DestinationNotEmptyError} —
 * nothing is written. The write phase (steps 4-8) runs inside a single
 * `try`/`catch`: any fatal error is re-thrown annotated with which phase it
 * failed in, and — only when the recorded flag says `projectRoot` did not
 * exist before this run — `projectRoot` is removed entirely via
 * `rm(projectRoot, { recursive: true, force: true })` first. A `projectRoot`
 * that already existed (necessarily empty, since a non-empty one is refused
 * above) is always left untouched. This mirrors
 * `import-scrivener-project.ts`'s FR-22 cleanup rule exactly.
 *
 * ## No leftover indexing
 *
 * The whole write phase runs inside {@link withIndexingSuspended}
 * (`indexer-queue.ts`), so every `enqueueIndex` call `writeSidecar` makes
 * during this run is a genuine no-op; the only indexing work this run ever
 * performs is the final rebuild-from-scratch pass, mirroring
 * `import-scrivener-project.ts`'s own convention.
 *
 * ## Metadata-schema group choice
 *
 * A fresh `docx-import` / "Imported Fields" group (mirroring
 * `import-scrivener-project.ts`'s own `scrivener-import` group) is created,
 * via `metadata-schema.ts`'s `addGroup`/`addField`, only when at least one
 * document processed during this run actually has a non-empty core author —
 * an import with no author anywhere leaves the destination project's
 * metadata schema untouched, the same parsimony `import-scrivener-project.ts`
 * applies to its own Label/custom-field group.
 *
 * This orchestrator deliberately does **not** call `runForTenant` itself,
 * for the same reason `import-scrivener-project.ts` does not — its callers
 * (the CLI, tests) do, following `createProjectFromType`'s precedent.
 */
import path from "node:path";
import { exists, mkdir, readFileBuffer, readdir, rm, writeFile } from "../io";
import { createProject } from "../project";
import { createFolderResource, createTextResource } from "../resource-factory";
import { writeResourceToFile } from "../resource-persistence";
import { writeRevision } from "../revision";
import { addField, addGroup } from "../metadata-schema";
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
import type { MetadataValue, Project, TextResource, UUID } from "../types";
import {
  buildDocxImportReport,
  writeDocxImportReport,
  type DocxImportReportInput,
  type DocxImportReportNoHeadingDocument,
  type DocxImportReportSkip,
  type DocxImportReportUntitledFallback,
} from "./docx-import-report";
import {
  detectDocxSource,
  walkDocxFolder,
  type DocxFolderSkipCounts,
  type DocxFolderWalkPlan,
  type DocxWalkEntry,
} from "./source-detection";
import { readDocxCoreProperties } from "./core-properties";
import {
  detectDocxPackageFeatures,
  type DocxPackageFeatures,
} from "./package-parts";
import {
  convertDocxToTiptap,
  type DocxNoteRef,
  type DocxTipTapBlockNode,
  type DocxTipTapDocument,
  type DocxTipTapParagraphNode,
} from "./mammoth-to-tiptap";
import {
  splitDocxAtHeadingLevel,
  type DocxSection,
  type HeadingSplitLevel,
} from "./heading-split";

/**
 * Thrown by {@link importDocxProject} per FR-8 when `projectType` does not
 * match any project-type spec's own `id` under
 * `getwrite-config/templates/project-types/`. Raised before any destination
 * write — nothing is created, written, or removed.
 */
export class UnknownProjectTypeError extends Error {
  constructor(projectType: string) {
    super(
      `Cannot import DOCX project: unknown project type "${projectType}". ` +
        `Choose one of the existing project types, or omit it for the default ("blank").`,
    );
    this.name = "UnknownProjectTypeError";
  }
}

/**
 * Thrown by {@link importDocxProject} per FR-7 when `projectRoot` already
 * exists and is non-empty. Raised before any destination write — nothing is
 * created, written, or removed. DOCX-specific wording (Stage 6.5,
 * 2026-09-13): unlike `import-scrivener-project.ts`'s own
 * `DestinationNotEmptyError`, this message never mentions Scrivener.
 */
export class DocxDestinationNotEmptyError extends Error {
  constructor(projectRoot: string) {
    super(
      `Cannot import DOCX project: destination "${projectRoot}" already ` +
        `exists and is not empty. Choose an empty or non-existent destination.`,
    );
    this.name = "DocxDestinationNotEmptyError";
  }
}

/** Default destination project type (FR-8, FR-9) when none is supplied. */
const DEFAULT_PROJECT_TYPE = "blank";

/** Default heading split level (FR-2, FR-9) when none is supplied. */
const DEFAULT_SPLIT_LEVEL: HeadingSplitLevel = 1;

const METADATA_GROUP_ID = "docx-import";
const METADATA_GROUP_LABEL = "Imported Fields";
const AUTHOR_FIELD_KEY = "author";
const AUTHOR_FIELD_LABEL = "Author";

/** Zero-valued {@link DocxFolderSkipCounts}, used for a single-file source (which never walks a folder). */
const ZERO_FOLDER_SKIP_COUNTS: DocxFolderSkipCounts = {
  nonDocxFilesSkippedCount: 0,
  lockFilesSkippedCount: 0,
  hiddenFilesSkippedCount: 0,
};

/** Input to {@link importDocxProject}. */
export interface ImportDocxProjectOptions {
  /** Absolute path to the source: either a single `.docx` file or a directory containing one or more `.docx` files (FR-1). */
  sourcePath: string;
  /** Absolute path where the new destination GetWrite project should be created. */
  projectRoot: string;
  /** Optional destination project name; see the module doc's per-source-shape naming rules (FR-14) for the default. */
  name?: string;
  /** Heading level to split a single-file source at (FR-2, FR-9); defaults to `1`. Ignored for a folder source, which never splits (FR-3). */
  splitLevel?: HeadingSplitLevel;
  /** Project-type spec `id` (FR-8, FR-9); defaults to `"blank"`. */
  projectType?: string;
}

/** Result of a successful {@link importDocxProject} run. */
export interface ImportDocxProjectResult {
  /** The created destination project. */
  readonly project: Project;
  /** Absolute path to the created destination project. */
  readonly projectRoot: string;
  /** Number of folders created (folder source only; always `0` for a single-file source). */
  readonly folderCount: number;
  /** Number of text resources created. */
  readonly resourceCount: number;
  /** Rendered FR-6 report text (already persisted via `writeDocxImportReport`). */
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
  "6. Create the docx-import metadata group's Author field",
  "7. Write the FR-6 report",
  "8. Rebuild the destination project's indexes",
] as const;

/** Mutable accumulator threaded through resource creation, folded into the FR-6 report at the end. */
interface ReportAccumulator {
  skips: DocxImportReportSkip[];
  commentsNotImportedCount: number;
  trackedChangesCount: number;
  imagesNotImportedCount: number;
  noHeadingFoundDocuments: DocxImportReportNoHeadingDocument[];
  footnoteEndnoteConvertedCount: number;
  /** Every resource named "Untitled"/"Untitled 2"/... by FR-14's preamble naming rule (FR-6(h)). */
  untitledFallbacks: DocxImportReportUntitledFallback[];
  /** `true` once at least one processed document had a non-empty core author (drives whether the `docx-import` group is created at all). */
  anyAuthorFound: boolean;
}

function newReportAccumulator(): ReportAccumulator {
  return {
    skips: [],
    commentsNotImportedCount: 0,
    trackedChangesCount: 0,
    imagesNotImportedCount: 0,
    noHeadingFoundDocuments: [],
    footnoteEndnoteConvertedCount: 0,
    untitledFallbacks: [],
    anyAuthorFound: false,
  };
}

/** Folds one document's package-feature detection (Task 5) into `acc`. */
function foldPackageFeatures(
  acc: ReportAccumulator,
  features: DocxPackageFeatures,
): void {
  acc.commentsNotImportedCount += features.commentCount;
  acc.trackedChangesCount += features.trackedChangeCount;
  acc.imagesNotImportedCount += features.imageCount;
}

/** Folds one document's mammoth conversion messages (FR-5) into `acc` as report skips. */
function foldMammothMessages(
  acc: ReportAccumulator,
  location: string,
  messages: readonly string[],
): void {
  for (const message of messages) {
    acc.skips.push({ location, reason: message });
  }
}

/**
 * Resolves and validates `projectType` (FR-8) against the existing
 * project-type specs under `getwrite-config/templates/project-types/`.
 *
 * @throws {UnknownProjectTypeError} When no spec's own `id` matches.
 */
async function resolveProjectTypeSeed(
  projectType: string,
): Promise<{ statuses?: string[]; relationshipTypes?: string[] }> {
  const entry = await getProjectType(projectType);
  if (entry === undefined) {
    throw new UnknownProjectTypeError(projectType);
  }
  return {
    statuses: entry.spec.statuses,
    relationshipTypes: entry.spec.relationshipTypes,
  };
}

/** Flattened, whitespace-joined plain text of a full converted document (including any appended Notes paragraphs), used for `content.txt`/word count/search indexing. */
function flattenDocumentPlainText(document: DocxTipTapDocument): string {
  return document.content
    .map((block) =>
      block.content
        .map((inline) => (inline.type === "text" ? inline.text : ""))
        .join(""),
    )
    .join("\n\n");
}

/**
 * Builds the trailing "Notes" paragraphs for a section/document's own
 * footnotes/endnotes (FR-13): a "Notes" label paragraph followed by one
 * plain paragraph per note, formatted `"n. text"`. No TipTap list node is
 * used — `bulletList`/`orderedList`/`listItem` are disabled in the editor's
 * schema (FR-13/resolved OQ-1), so a numbered list is rendered as plain
 * paragraphs instead. Returns an empty array when there are no notes.
 */
function buildNotesParagraphs(
  notes: readonly DocxNoteRef[],
): DocxTipTapParagraphNode[] {
  if (notes.length === 0) return [];
  const paragraphs: DocxTipTapParagraphNode[] = [
    { type: "paragraph", content: [{ type: "text", text: "Notes" }] },
  ];
  for (const note of notes) {
    paragraphs.push({
      type: "paragraph",
      content: [{ type: "text", text: `${note.n}. ${note.text}` }],
    });
  }
  return paragraphs;
}

/** Appends `notes`' trailing paragraphs (see {@link buildNotesParagraphs}) to `document`'s own content, returning a new document (the original is never mutated). */
function appendNotes(
  document: DocxTipTapDocument,
  notes: readonly DocxNoteRef[],
): DocxTipTapDocument {
  const notesParagraphs = buildNotesParagraphs(notes);
  if (notesParagraphs.length === 0) return document;
  const content: DocxTipTapBlockNode[] = [
    ...document.content,
    ...notesParagraphs,
  ];
  return { type: "doc", content };
}

/** `{ author: <author> }` when `author` is present, otherwise `undefined` — a resource's `userMetadata` seed for the `docx-import` group's "Author" field (FR-14). */
function authorUserMetadata(
  author: string | undefined,
): Record<string, MetadataValue> | undefined {
  return author === undefined ? undefined : { [AUTHOR_FIELD_KEY]: author };
}

/**
 * Creates and persists one text resource from an already-converted,
 * notes-appended `DocxTipTapDocument`, via the bulk-create pattern
 * (`writeResourceToFile` + `writeRevision(..., { isCanonical: true })`).
 */
async function createAndWriteDocxResource(
  projectRoot: string,
  params: {
    name: string;
    folderId: UUID | null;
    document: DocxTipTapDocument;
    orderIndex: number;
    author?: string;
  },
): Promise<TextResource> {
  const plainText = flattenDocumentPlainText(params.document);
  const resource = createTextResource({
    name: params.name,
    folderId: params.folderId,
    plainText,
    tiptap: params.document,
    orderIndex: params.orderIndex,
    userMetadata: authorUserMetadata(params.author),
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

/** Pure (read-only) result of planning a single-file DOCX source, computed before any destination write (FR-2, FR-14). */
interface SingleFileImportPlan {
  readonly title?: string;
  readonly author?: string;
  readonly sections: readonly DocxSection[];
  readonly noHeadingFound: boolean;
  /**
   * `true` when this plan's single section represents the *whole document*
   * with no split applied — either `noHeadingFound` (a numeric level with no
   * matching heading anywhere) or `splitLevel: "none"` (Stage 6.5,
   * 2026-09-13, FR-14). That one resource is named from `title`, falling
   * back to the source filename, rather than from `sections[0]`'s own
   * (irrelevant, since it's always alone) `heading-split.ts` placeholder.
   */
  readonly isWholeDocument: boolean;
  readonly packageFeatures: DocxPackageFeatures;
  readonly messages: readonly string[];
}

/** Plans a single-file DOCX import (FR-2, FR-14): reads its core properties, detects its package features, converts it, and splits it — no destination write. */
async function planSingleFileImport(
  sourcePath: string,
  splitLevel: HeadingSplitLevel,
): Promise<SingleFileImportPlan> {
  const docxBytes = await readFileBuffer(sourcePath);
  const [coreProperties, packageFeatures, converted] = await Promise.all([
    readDocxCoreProperties(docxBytes),
    detectDocxPackageFeatures(docxBytes),
    convertDocxToTiptap(docxBytes),
  ]);
  const splitResult = splitDocxAtHeadingLevel(
    converted.document,
    converted.notes,
    splitLevel,
  );
  return {
    title: coreProperties.title,
    author: coreProperties.author,
    sections: splitResult.sections,
    noHeadingFound: splitResult.noHeadingFound,
    isWholeDocument: splitLevel === "none" || splitResult.noHeadingFound,
    packageFeatures,
    messages: converted.messages,
  };
}

/** `title` when non-empty, else `sourcePath`'s basename without its `.docx`
 * extension (FR-14's no-heading/preamble naming rule, Stage 6.5,
 * 2026-09-13) — used for a single-file source's one resource when the whole
 * document has no heading at the chosen split level, or `splitLevel:
 * "none"`. */
function resolveWholeDocumentResourceName(
  title: string | undefined,
  sourcePath: string,
): string {
  if (title !== undefined && title.trim() !== "") return title;
  return path.basename(sourcePath, path.extname(sourcePath));
}

/**
 * Creates one resource per {@link SingleFileImportPlan} section (FR-2),
 * appending each section's own Notes list as trailing paragraphs and
 * writing the document's own author (shared across every section, FR-14)
 * onto each.
 *
 * Naming (FR-14's no-heading/preamble rule, Stage 6.5, 2026-09-13): when
 * `plan.isWholeDocument` is `true`, the plan's single section is named from
 * `sourcePath` via {@link resolveWholeDocumentResourceName} rather than from
 * its own (irrelevant `heading-split.ts` placeholder) title. Otherwise every
 * section keeps its own already-resolved `title` — a real heading's text
 * unchanged, or `heading-split.ts`'s already-deduplicated "Untitled"/
 * "Untitled 2"/... placeholder (`titleSource: "auto"`), each such
 * placeholder folded into `acc.untitledFallbacks` for the FR-6(h) report.
 */
async function writeSingleFileSections(
  projectRoot: string,
  sourcePath: string,
  plan: SingleFileImportPlan,
  acc: ReportAccumulator,
): Promise<number> {
  if (plan.isWholeDocument) {
    const section = plan.sections[0];
    const documentWithNotes = appendNotes(section.content, section.notes);
    await createAndWriteDocxResource(projectRoot, {
      name: resolveWholeDocumentResourceName(plan.title, sourcePath),
      folderId: null,
      document: documentWithNotes,
      orderIndex: 0,
      author: plan.author,
    });
    return 1;
  }

  let orderIndex = 0;
  for (const section of plan.sections) {
    if (section.titleSource === "auto") {
      acc.untitledFallbacks.push({
        resourceName: section.title,
        documentPath: sourcePath,
      });
    }
    const documentWithNotes = appendNotes(section.content, section.notes);
    await createAndWriteDocxResource(projectRoot, {
      name: section.title,
      folderId: null,
      document: documentWithNotes,
      orderIndex: orderIndex++,
      author: plan.author,
    });
  }
  return plan.sections.length;
}

/**
 * Recursively creates resources/folders from a Task 3 folder-walk plan
 * (FR-3, FR-15): one resource per `.docx` file (independently converted,
 * never split), mirroring subfolders as GetWrite folders in the walk's own
 * sorted order.
 */
async function writeFolderEntries(
  projectRoot: string,
  entries: readonly DocxWalkEntry[],
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

    const docxBytes = await readFileBuffer(entry.path);
    const [coreProperties, packageFeatures, converted] = await Promise.all([
      readDocxCoreProperties(docxBytes),
      detectDocxPackageFeatures(docxBytes),
      convertDocxToTiptap(docxBytes),
    ]);

    foldPackageFeatures(acc, packageFeatures);
    foldMammothMessages(acc, entry.path, converted.messages);
    acc.footnoteEndnoteConvertedCount += converted.notes.length;
    if (coreProperties.author !== undefined) acc.anyAuthorFound = true;

    const documentWithNotes = appendNotes(converted.document, converted.notes);
    const fallbackName = path.basename(entry.name, path.extname(entry.name));
    const resourceName =
      coreProperties.title !== undefined && coreProperties.title.trim() !== ""
        ? coreProperties.title
        : fallbackName;

    await createAndWriteDocxResource(projectRoot, {
      name: resourceName,
      folderId: parentFolderId,
      document: documentWithNotes,
      orderIndex: orderIndex++,
      author: coreProperties.author,
    });
    counts.resourceCount += 1;
  }
}

/**
 * Imports a single `.docx` file or a directory of `.docx` files into a new,
 * complete GetWrite project at `projectRoot` (FR-1 through FR-9, FR-13
 * through FR-18).
 *
 * @throws {UnknownProjectTypeError} When `projectType` does not match an
 *   existing project-type spec (FR-8). Nothing is written in this case.
 * @throws {DocxDestinationNotEmptyError} When `projectRoot` already exists
 *   and is non-empty (FR-7). Nothing is written in this case.
 * @throws {NoDocxFilesFoundError} When `sourcePath` is a directory
 *   containing no `.docx` file anywhere in its tree (FR-1). Nothing is
 *   written in this case.
 */
export async function importDocxProject(
  options: ImportDocxProjectOptions,
): Promise<ImportDocxProjectResult> {
  const { sourcePath, projectRoot } = options;
  const splitLevel = options.splitLevel ?? DEFAULT_SPLIT_LEVEL;
  const projectTypeId = options.projectType ?? DEFAULT_PROJECT_TYPE;

  // FR-8: validated before any write.
  const projectTypeSeed = await resolveProjectTypeSeed(projectTypeId);

  // FR-7: recorded, once and before any write, whether projectRoot existed
  // before this run — this recorded value (not a later filesystem check) is
  // what "run-created" means for this run's fatal-error cleanup below. A
  // pre-existing, non-empty projectRoot is refused up front, before any
  // write.
  const didProjectRootExistBeforeRun = await exists(projectRoot);
  if (didProjectRootExistBeforeRun) {
    const existingEntries = (await readdir(projectRoot)) as string[];
    if (existingEntries.length > 0) {
      throw new DocxDestinationNotEmptyError(projectRoot);
    }
  }

  // FR-1: auto-detect the source shape; refuses a folder with no .docx
  // anywhere beneath it before any write.
  const detected = await detectDocxSource(sourcePath);

  // ── Planning (pure; no destination writes yet) ──────────────────────────
  const singleFilePlan =
    detected.kind === "file"
      ? await planSingleFileImport(sourcePath, splitLevel)
      : undefined;
  const folderPlan: DocxFolderWalkPlan | undefined =
    detected.kind === "directory"
      ? await walkDocxFolder(sourcePath)
      : undefined;

  let currentPhase: (typeof ORCHESTRATION_PHASES)[number] =
    ORCHESTRATION_PHASES[0];
  try {
    return await withIndexingSuspended(async () => runWritePhase());
  } catch (err) {
    const originalMessage = err instanceof Error ? err.message : String(err);
    const wrapped = new Error(
      `DOCX import failed during orchestration phase "${currentPhase}": ${originalMessage}`,
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

  async function runWritePhase(): Promise<ImportDocxProjectResult> {
    const acc = newReportAccumulator();

    if (singleFilePlan !== undefined) {
      foldPackageFeatures(acc, singleFilePlan.packageFeatures);
      foldMammothMessages(acc, sourcePath, singleFilePlan.messages);
      if (singleFilePlan.noHeadingFound) {
        acc.noHeadingFoundDocuments.push({ documentPath: sourcePath });
      }
      for (const section of singleFilePlan.sections) {
        acc.footnoteEndnoteConvertedCount += section.notes.length;
      }
      if (singleFilePlan.author !== undefined) acc.anyAuthorFound = true;
    }

    // ── Destination project ────────────────────────────────────────────────
    const projectName =
      options.name ??
      singleFilePlan?.title ??
      (detected.kind === "directory"
        ? path.basename(sourcePath)
        : path.basename(sourcePath, path.extname(sourcePath)));
    const project = createProject({
      name: projectName,
      projectType: projectTypeId,
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
    let folderSkipCounts: DocxFolderSkipCounts = ZERO_FOLDER_SKIP_COUNTS;

    if (singleFilePlan !== undefined) {
      resourceCount = await writeSingleFileSections(
        projectRoot,
        sourcePath,
        singleFilePlan,
        acc,
      );
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

    // ── Metadata schema: Author field (FR-14) ──────────────────────────────
    currentPhase = ORCHESTRATION_PHASES[2];
    if (acc.anyAuthorFound) {
      await addGroup(projectRoot, {
        id: METADATA_GROUP_ID,
        label: METADATA_GROUP_LABEL,
        fields: [],
      });
      await addField(projectRoot, METADATA_GROUP_ID, {
        key: AUTHOR_FIELD_KEY,
        label: AUTHOR_FIELD_LABEL,
        type: "text",
      });
    }

    // ── Report (FR-6) ──────────────────────────────────────────────────────
    currentPhase = ORCHESTRATION_PHASES[3];
    const reportInput: DocxImportReportInput = {
      skips: acc.skips,
      commentsNotImportedCount: acc.commentsNotImportedCount,
      trackedChangesCount: acc.trackedChangesCount,
      imagesNotImportedCount: acc.imagesNotImportedCount,
      nonDocxFilesSkippedCount: folderSkipCounts.nonDocxFilesSkippedCount,
      lockFilesSkippedCount: folderSkipCounts.lockFilesSkippedCount,
      hiddenFilesSkippedCount: folderSkipCounts.hiddenFilesSkippedCount,
      noHeadingFoundDocuments: acc.noHeadingFoundDocuments,
      footnoteEndnoteConvertedCount: acc.footnoteEndnoteConvertedCount,
      untitledFallbacks: acc.untitledFallbacks,
    };
    const report = buildDocxImportReport(reportInput);
    await writeDocxImportReport(projectRoot, report);

    // ── Rebuild indexes, mirroring cli/src/commands/reindex.ts ────────────
    currentPhase = ORCHESTRATION_PHASES[4];
    await rebuildIndexes(projectRoot);

    return { project, projectRoot, folderCount, resourceCount, report };
  }
}

/**
 * Rebuilds the destination project's inverted index, backlinks, and entity
 * mention index from scratch, mirroring `cli/src/commands/reindex.ts:23-60`
 * (same as `import-scrivener-project.ts`'s own rebuild).
 */
async function rebuildIndexes(projectRoot: string): Promise<void> {
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
}
