/**
 * @module import-scrivener-project
 *
 * The single model-layer entry point for the Scrivener CLI importer (Task 8,
 * `specs/features/scrivener-cli-importer.md` FR-1, FR-4, FR-10, FR-11): ties
 * the parser (Task 2), RTF→TipTap converter (Task 3), binder mapper (Task 4),
 * metadata mapper (Task 5), report builder (Task 6), and sidecar/feature-toggle
 * applier (Task 7) together into one call that produces a complete, valid
 * destination GetWrite project.
 *
 * ## Error-signaling convention
 *
 * {@link importScrivenerProject} throws {@link UnsupportedScrivenerProjectError}
 * for the FR-2 refusal case, rather than returning a discriminated-union
 * result. This matches the codebase's existing convention for
 * control-flow-relevant failures a caller must distinguish from "something
 * went wrong" (`ScrivxParseError`, `ProjectBusyError`,
 * `SameEntityRelationshipError`, `InvalidClearKeysCoreError`): a dedicated
 * `Error` subclass the caller can `instanceof`-check. Task 9's CLI wrapper is
 * expected to catch this specific error type and map it to a non-zero exit
 * code with the error's own message; every other thrown error is an
 * unexpected failure and should map to the same generic non-zero exit path
 * `project create` already uses.
 *
 * ## Orchestration order
 *
 * 1. Resolve the source project's single `*.scrivx` file inside `scrivPath`
 *    and parse it (Task 2). Refuse per FR-2 before any destination write.
 * 2. Build the binder→resource-tree plan (Task 4) and the metadata plan
 *    (Task 5) — both pure, no destination writes yet.
 * 3. Create the destination `project.json`, seeding `config.statuses` from
 *    the metadata plan (FR-6).
 * 4. Create every planned folder, then every planned resource (bulk-create
 *    pattern: `writeResourceToFile` + `writeRevision(..., { isCanonical:
 *    true })`), converting each resource's `content.rtf` via Task 3 and
 *    seeding its sidecar `userMetadata` from the metadata plan's resolved
 *    per-document status/label/custom-field values (FR-4, FR-6, FR-7).
 * 5. Create the "Label" and custom metadata-schema fields (Task 5's plan)
 *    under a dedicated `scrivener-import` group (see below), skipped
 *    entirely when the plan has neither.
 * 6. Create tags for the keyword-merge plan and assign them to resources
 *    (FR-15).
 * 7. Apply Task 7's per-resource synopsis/notes sidecar merge and the
 *    aggregated feature-toggle enablement.
 * 8. Write the Task 6 report, having scanned the source project's
 *    `Snapshots/` directory for FR-9(f) (the one piece of report input no
 *    earlier task already assembles) and folded in Task 12's `.scrivx`
 *    fragment errors, Task 13's per-document metadata value skips, and the
 *    binder mapper's FR-19 untitled-fallback-name list — none of which can
 *    abort the run by this point, since Task 12/13 already made them
 *    non-throwing at their source.
 * 9. Rebuild the destination project's indexes, mirroring
 *    `cli/src/commands/reindex.ts`'s rebuild-from-scratch logic (FR-11).
 *
 * No step above ever writes to, renames, or deletes anything under
 * `scrivPath` — every read of the source project uses `io.ts`'s read-only
 * wrappers (`readFile`/`readdir`/`exists`), never a mutating one (FR-10).
 *
 * ## FR-22: destination cleanup on fatal error
 *
 * Before step 3 (any destination write), whether `projectRoot` already
 * exists is checked once and recorded; a `projectRoot` that already exists
 * and is non-empty is refused immediately via
 * {@link DestinationNotEmptyError} — nothing is written, and steps 3-9 never
 * run. Steps 3-9 (the write phase) run inside a single `try`/`catch`: any
 * fatal error (never an FR-8/FR-20 per-item/per-value skip, which are
 * recorded and never thrown) is re-thrown annotated with which of the
 * numbered steps above it failed in, and — only when the recorded flag says
 * `projectRoot` did not exist before this run — `projectRoot` is removed
 * entirely via `rm(projectRoot, { recursive: true, force: true })` first. A
 * `projectRoot` that already existed (necessarily empty, since a non-empty
 * one is refused above) is always left untouched.
 *
 * ## FR-23: no leftover indexing (Task 19)
 *
 * The whole write phase (steps 3-9) runs inside {@link withIndexingSuspended}
 * (`indexer-queue.ts`), so every `enqueueIndex` call `writeSidecar` makes
 * during this run — one per resource/sidecar write — is a genuine no-op:
 * `isStopped` is forced `true` for the duration, which `enqueueIndex` checks
 * at its own top before doing any queueing, indexing, or watcher-start. The
 * only indexing work this run ever performs is step 9's FR-11
 * rebuild-from-scratch pass, after the suspension has already ended. Because
 * nothing is ever actually enqueued, the FR-22 cleanup path above no longer
 * needs to drain the indexer queue before removing a partially-written
 * `projectRoot` — there is nothing in flight to race against.
 *
 * ## Metadata-schema group choice
 *
 * `DEFAULT_METADATA_SCHEMA` (`default-metadata-schema.ts`) has exactly two
 * groups: `builtin-document` (which already owns a *locked* built-in
 * `status` select field with no configurable `options`) and
 * `builtin-story-timeline`. Neither is an appropriate home for the Label
 * field or per-project custom fields: folding them into `builtin-document`
 * would mix built-in, always-present fields with fields that only exist
 * because of this one import, and there is no existing "custom fields"
 * group anywhere in the default schema to reuse. A fresh group,
 * `scrivener-import` / "Imported Fields", is created (only when there is at
 * least one field to add) via `metadata-schema.ts`'s `addGroup` before the
 * fields are added via `addField` — leaving `DEFAULT_METADATA_SCHEMA`
 * itself untouched and making every imported field's origin legible in the
 * schema manager.
 *
 * This orchestrator deliberately does **not** call `runForTenant` itself —
 * `createProjectFromType` (`project-creator.ts`), the closest existing
 * precedent for "create a complete project on disk," does not wrap itself
 * in `runForTenant` either; its callers (the CLI, tests) do. Task 9's CLI
 * command is expected to follow the same convention `project create`
 * already uses.
 */
import path from "node:path";
import { exists, mkdir, readdir, readFile, rm, writeFile } from "../io";
import { generateUUID } from "../uuid";
import { createProject } from "../project";
import { createFolderResource, createTextResource } from "../resource-factory";
import { writeResourceToFile } from "../resource-persistence";
import { writeRevision } from "../revision";
import { addField, addGroup } from "../metadata-schema";
import { withIndexingSuspended } from "../indexer-queue";
import { createTag, assignTagToResource } from "../tags";
import { updateFeatureConfig } from "../project-features";
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
import type { MetadataValue, Project, TextResource, UUID } from "../types";
import {
  applyDocumentMetadata,
  resolveFeatureTogglesToEnable,
  type DocumentMetadataFlags,
} from "./apply-document-metadata";
import {
  buildImportReport,
  writeImportReport,
  type ImportReportInput,
  type ImportReportSkip,
  type ImportReportSnapshot,
} from "./import-report";
import { isSupportedScrivenerProject, parseScrivxFile } from "./scrivx-parser";
import {
  mapBinderToImportPlan,
  type ImportPlanId,
  type ImportPlanResource,
} from "./binder-mapper";
import { buildMetadataPlan } from "./metadata-mapper";
import { convertRtfToTiptap } from "./rtf-to-tiptap";
import type { ScrivxBinderItem } from "./scrivx-types";

/**
 * Thrown by {@link importScrivenerProject} when the source project at
 * `scrivPath` fails FR-2's Creator allow-list check, or when its `.scrivx`
 * file cannot be located. Nothing is written to `projectRoot` before this is
 * thrown — see the module doc's "Error-signaling convention".
 */
export class UnsupportedScrivenerProjectError extends Error {
  constructor(scrivPath: string, reason: string) {
    super(`Cannot import Scrivener project at "${scrivPath}": ${reason}`);
    this.name = "UnsupportedScrivenerProjectError";
  }
}

/**
 * Thrown by {@link importScrivenerProject} per FR-22 when `projectRoot`
 * already exists and is non-empty. Raised before any destination write —
 * nothing is created, written, or removed.
 */
export class DestinationNotEmptyError extends Error {
  constructor(projectRoot: string) {
    super(
      `Cannot import Scrivener project: destination "${projectRoot}" ` +
        `already exists and is not empty. Choose an empty or non-existent ` +
        `destination.`,
    );
    this.name = "DestinationNotEmptyError";
  }
}

/**
 * The module doc's "Orchestration order" list (steps 3-9; steps 1-2 run
 * before any destination write and cannot trigger the FR-22 cleanup below),
 * used to label which phase a fatal write-phase error occurred in.
 */
const ORCHESTRATION_PHASES = [
  "3. Create the destination project.json",
  "4. Create every planned folder, then every planned resource",
  "5. Create the Label and custom metadata-schema fields",
  "6. Create tags for the keyword-merge plan and assign them to resources",
  "7. Apply the per-resource synopsis/notes sidecar merge and the aggregated feature-toggle enablement",
  "8. Write the FR-9 report",
  "9. Rebuild the destination project's indexes (FR-11)",
] as const;

/** Input to {@link importScrivenerProject}. */
export interface ImportScrivenerProjectOptions {
  /** Absolute path to the source `.scriv` package directory (not the `.scrivx` file itself). */
  scrivPath: string;
  /** Absolute path where the new destination GetWrite project should be created. */
  projectRoot: string;
  /** Optional destination project name; defaults to `scrivPath`'s basename with the `.scriv` extension stripped. */
  name?: string;
}

/** Result of a successful {@link importScrivenerProject} run. */
export interface ImportScrivenerProjectResult {
  /** The created destination project. */
  readonly project: Project;
  /** Absolute path to the created destination project. */
  readonly projectRoot: string;
  /** Number of folders created. */
  readonly folderCount: number;
  /** Number of text resources created. */
  readonly resourceCount: number;
  /** Number of tags created. */
  readonly tagCount: number;
  /** Rendered FR-9 report text (already persisted via `writeImportReport`). */
  readonly report: string;
}

const METADATA_GROUP_ID = "scrivener-import";
const METADATA_GROUP_LABEL = "Imported Fields";

/**
 * Imports a Scrivener 3, Mac-authored `.scriv` project into a new, complete
 * GetWrite project at `projectRoot` (FR-1, FR-4, FR-10, FR-11).
 *
 * @throws {UnsupportedScrivenerProjectError} When the source project is not
 *   Scrivener 3, Mac-authored (FR-2), or its `.scrivx` file cannot be found.
 *   Nothing is written to `projectRoot` in this case.
 */
export async function importScrivenerProject(
  options: ImportScrivenerProjectOptions,
): Promise<ImportScrivenerProjectResult> {
  const { scrivPath, projectRoot } = options;

  const scrivxPath = await resolveScrivxPath(scrivPath);
  const parsed = await parseScrivxFile(scrivxPath);

  if (!isSupportedScrivenerProject(parsed.creator)) {
    throw new UnsupportedScrivenerProjectError(
      scrivPath,
      `unsupported Creator "${parsed.creator}" (only Scrivener 3, Mac-authored ` +
        `projects — Creator starting with "SCRMAC-3" — are supported).`,
    );
  }

  // ── Planning (pure; no destination writes yet) ──────────────────────────
  const plan = await mapBinderToImportPlan(parsed, scrivxPath);
  const metadataPlan = buildMetadataPlan(parsed);

  // FR-22: record, once and before any write, whether projectRoot existed
  // before this run — this recorded value (not a later filesystem check) is
  // what "run-created" means for this run's fatal-error cleanup below. A
  // pre-existing, non-empty projectRoot is refused up front, before any
  // write.
  const didProjectRootExistBeforeRun = await exists(projectRoot);
  if (didProjectRootExistBeforeRun) {
    const existingEntries = (await readdir(projectRoot)) as string[];
    if (existingEntries.length > 0) {
      throw new DestinationNotEmptyError(projectRoot);
    }
  }

  // FR-7's amendment: a candidate field key colliding with a built-in or an
  // already-added field (`metadataPlan.fieldKeyRenames`) resolves to a free
  // `<originalKey>-scrivener[-<n>]` key. This map lets every downstream
  // consumer of a field's *original* derived key (the Label field's plan
  // key and each custom field's `deriveFieldKey`-derived key) resolve the
  // actual key to write, without `metadata-mapper.ts` needing to rewrite its
  // own `labelField`/`customFields`/`resourceUserMetadata` output.
  const finalFieldKeyByOriginalKey = new Map(
    metadataPlan.fieldKeyRenames.map((rename) => [
      rename.originalKey,
      rename.renamedKey,
    ]),
  );

  // ── Write phase (steps 3-9) ──────────────────────────────────────────────
  // FR-22: any fatal error raised anywhere in here (never an FR-8/FR-20
  // per-item/per-value skip, which are pushed onto `skips`/`valueSkips` and
  // never thrown) must, before propagating: identify the orchestration
  // phase it failed in, and remove `projectRoot` entirely if this run
  // created it (never otherwise, and never any other path).
  let currentPhase: (typeof ORCHESTRATION_PHASES)[number] =
    ORCHESTRATION_PHASES[0];
  try {
    // FR-23 (Task 19): suspend GetWrite's normal background
    // indexing/backlinks-watcher machinery for the whole write phase.
    // `writeSidecar`'s `enqueueIndex` calls made during this run become
    // genuine no-ops (see `indexer-queue.ts`'s `isStopped` check at the top
    // of `enqueueIndex`), so the FR-11 rebuild below is the only indexing
    // work this run ever performs. Process-wide by design — see
    // `withIndexingSuspended`'s own doc comment for why that is safe here
    // (one-shot CLI import) and not in the long-running server.
    return await withIndexingSuspended(async () => {
      return await runWritephase();
    });
  } catch (err) {
    const originalMessage = err instanceof Error ? err.message : String(err);
    const wrapped = new Error(
      `Scrivener import failed during orchestration phase "${currentPhase}": ${originalMessage}`,
      { cause: err },
    );
    // FR-22: only remove projectRoot when this run created it; a
    // pre-existing (necessarily empty, per the up-front refusal above)
    // projectRoot is left completely untouched.
    if (!didProjectRootExistBeforeRun) {
      await rm(projectRoot, { recursive: true, force: true }).catch(() => {
        // Best-effort cleanup: the original error is what matters to the
        // caller either way.
      });
    }
    throw wrapped;
  }

  async function runWritephase(): Promise<ImportScrivenerProjectResult> {
    // ── Destination project ────────────────────────────────────────────────
    const projectName =
      options.name ?? path.basename(scrivPath).replace(/\.scriv$/i, "");
    const project = createProject({
      name: projectName,
      slug: slugify(projectName),
      rootPath: projectRoot,
      config: { editorConfig: {}, statuses: [...metadataPlan.statuses] },
    });
    await mkdir(projectRoot, { recursive: true });
    await writeFile(
      path.join(projectRoot, "project.json"),
      JSON.stringify(project, null, 2),
      "utf8",
    );

    // ── Folders (plan array is already parent-before-child ordered) ───────
    currentPhase = ORCHESTRATION_PHASES[1];
    const realIdByPlanId = new Map<ImportPlanId, UUID>();
    for (const folder of plan.folders) {
      const realParentId =
        folder.parentId === null
          ? null
          : (realIdByPlanId.get(folder.parentId) ?? null);
      const folderResource = createFolderResource({
        name: folder.name,
        parentFolderId: realParentId,
        orderIndex: folder.orderIndex,
      });
      await writeResourceToFile(projectRoot, folderResource);
      realIdByPlanId.set(folder.id, folderResource.id);
    }

    // ── Resources ───────────────────────────────────────────────────────
    const skips: ImportReportSkip[] = [];
    const sourceUuidToResourceId = new Map<string, UUID>();
    const documentFlags: DocumentMetadataFlags[] = [];

    for (const resourcePlan of plan.resources) {
      currentPhase = ORCHESTRATION_PHASES[1];
      const created = await createAndWriteResource(
        projectRoot,
        resourcePlan,
        realIdByPlanId,
        metadataPlan.resourceUserMetadata,
        finalFieldKeyByOriginalKey,
        skips,
      );
      if (!created) continue;
      sourceUuidToResourceId.set(resourcePlan.sourceUuid, created.id);

      currentPhase = ORCHESTRATION_PHASES[4];
      const flags = await applySynopsisAndNotes(
        projectRoot,
        resourcePlan,
        created.id,
      );
      documentFlags.push(flags);
    }

    // ── Metadata schema: Label field + custom fields (FR-7, FR-15) ───────
    currentPhase = ORCHESTRATION_PHASES[2];
    const schemaFields = [
      ...(metadataPlan.labelField ? [metadataPlan.labelField] : []),
      ...metadataPlan.customFields,
    ];
    if (schemaFields.length > 0) {
      await addGroup(projectRoot, {
        id: METADATA_GROUP_ID,
        label: METADATA_GROUP_LABEL,
        fields: [],
      });
      for (const field of schemaFields) {
        // FR-7's amendment: use the collision-resolved key (recorded by
        // `buildMetadataPlan`'s `fieldKeyRenames`) when this field's
        // original key collided with a built-in or already-added field;
        // otherwise the field's own key is already free.
        const finalKey = finalFieldKeyByOriginalKey.get(field.key) ?? field.key;
        const fieldToCreate =
          finalKey === field.key ? field : { ...field, key: finalKey };
        // FR-8's generalization: any per-field metadata-schema creation
        // failure — including one this pre-resolution should have already
        // prevented, and any other unexpected `addField` failure — is a
        // recorded skip, never a reason to abort the whole import.
        try {
          await addField(projectRoot, METADATA_GROUP_ID, fieldToCreate);
        } catch (err) {
          skips.push({
            itemTitle: field.label,
            binderPath: `CustomMetaData/${field.key}`,
            reason: `Could not create metadata field "${field.label}": ${(err as Error).message}`,
          });
        }
      }
    }

    // ── Tags (FR-15 Keywords) ─────────────────────────────────────────────
    currentPhase = ORCHESTRATION_PHASES[3];
    const realTagIdByPlanTagId = new Map<string, string>();
    for (const plannedTag of metadataPlan.keywordTagPlan.tags) {
      const tag = await createTag(projectRoot, plannedTag.name);
      realTagIdByPlanTagId.set(plannedTag.id, tag.id);
    }
    for (const [sourceUuid, planTagIds] of metadataPlan.keywordTagPlan
      .resourceKeywordTagIds) {
      const resourceId = sourceUuidToResourceId.get(sourceUuid);
      if (resourceId === undefined) continue;
      for (const planTagId of planTagIds) {
        const realTagId = realTagIdByPlanTagId.get(planTagId);
        if (realTagId === undefined) continue;
        await assignTagToResource(projectRoot, resourceId, realTagId);
      }
    }

    // ── Feature toggles (FR-5) ────────────────────────────────────────────
    currentPhase = ORCHESTRATION_PHASES[4];
    const toggles = resolveFeatureTogglesToEnable(documentFlags);
    if (Object.keys(toggles).length > 0) {
      await updateFeatureConfig(projectRoot, { features: toggles });
    }

    // ── Report (FR-9) ─────────────────────────────────────────────────────
    currentPhase = ORCHESTRATION_PHASES[5];
    const titleByUuid = buildUuidTitleIndex(parsed.binder);
    const packageDir = path.dirname(scrivxPath);
    const snapshots = await scanSnapshots(packageDir, titleByUuid);

    const binderPathBySourceUuid = new Map<string, string>(
      plan.resources.map((resource) => [
        resource.sourceUuid,
        resource.binderPath,
      ]),
    );

    const reportInput: ImportReportInput = {
      skips: [
        ...skips,
        ...metadataPlan.unsupportedFields.map((field) => ({
          itemTitle: field.fieldTitle,
          binderPath: `CustomMetaData/${field.fieldId}`,
          reason: field.reason,
        })),
        // Task 12's recoverable .scrivx fragment errors — already shaped
        // identically to ImportReportSkip (itemTitle/binderPath/reason).
        ...parsed.fragmentErrors,
        // Task 13's per-document metadata value skips (FR-20); joined
        // against the binder plan for a binder path, since
        // MetadataPlan.valueSkips only carries sourceUuid
        // (buildMetadataPlan doesn't compute a binder path — see
        // MetadataValueSkip's doc comment).
        ...metadataPlan.valueSkips.map((skip) => ({
          itemTitle: skip.itemTitle,
          binderPath:
            binderPathBySourceUuid.get(skip.sourceUuid) ?? skip.sourceUuid,
          reason: skip.reason,
        })),
      ],
      fieldKeyRenames: metadataPlan.fieldKeyRenames,
      keywordMerges: metadataPlan.keywordTagPlan.merges.map((merge) => ({
        leafName: merge.leafName,
        mergedParentPaths: merge.parentPaths,
      })),
      nonTextResearch: plan.nonTextResearch,
      excludedOther: plan.excluded
        .filter((item) => item.reason === "other-type")
        .map((item) => ({
          itemTitle: item.itemTitle,
          binderPath: item.binderPath,
        })),
      trashContent: plan.excluded
        .filter((item) => item.reason === "trash")
        .map((item) => ({
          itemTitle: item.itemTitle,
          binderPath: item.binderPath,
        })),
      snapshots,
      untitledFallbacks: plan.untitledFallbacks,
    };
    const report = buildImportReport(reportInput);
    await writeImportReport(projectRoot, report);

    // ── Rebuild indexes (FR-11), mirroring cli/src/commands/reindex.ts ────
    currentPhase = ORCHESTRATION_PHASES[6];
    await rebuildIndexes(projectRoot);

    return {
      project,
      projectRoot,
      folderCount: plan.folders.length,
      resourceCount: sourceUuidToResourceId.size,
      tagCount: realTagIdByPlanTagId.size,
      report,
    };
  }
}

/**
 * Locates the single `*.scrivx` file directly under `scrivPath` (the `.scriv`
 * package directory).
 *
 * @throws {UnsupportedScrivenerProjectError} When no `.scrivx` file is found.
 */
async function resolveScrivxPath(scrivPath: string): Promise<string> {
  let entries: string[];
  try {
    const raw = await readdir(scrivPath);
    entries = (raw as string[]).filter((e) => typeof e === "string");
  } catch (err) {
    throw new UnsupportedScrivenerProjectError(
      scrivPath,
      `could not read the source directory: ${(err as Error).message}`,
    );
  }
  const scrivxEntry = entries.find((entry) =>
    entry.toLowerCase().endsWith(".scrivx"),
  );
  if (scrivxEntry === undefined) {
    throw new UnsupportedScrivenerProjectError(
      scrivPath,
      "no .scrivx file found directly under the source directory",
    );
  }
  return path.join(scrivPath, scrivxEntry);
}

/**
 * Rekeys a resolved per-document `userMetadata` record so its keys match the
 * actual metadata-schema field keys that will be created (FR-7's amendment):
 * `metadata-mapper.ts`'s `resourceUserMetadata` is keyed by each field's
 * pre-collision-check derived key, but a field whose key collided with a
 * built-in or already-added field is created under a renamed key — the
 * sidecar value must be written under that same renamed key, or it would
 * never match up with the field actually shown in the metadata schema.
 * Keys with no matching rename pass through unchanged.
 */
function applyFieldKeyRenames(
  userMetadata: Readonly<Record<string, string>> | undefined,
  finalFieldKeyByOriginalKey: ReadonlyMap<string, string>,
): Readonly<Record<string, string>> | undefined {
  if (userMetadata === undefined) return undefined;
  if (finalFieldKeyByOriginalKey.size === 0) return userMetadata;

  const rekeyed: Record<string, string> = {};
  for (const [key, value] of Object.entries(userMetadata)) {
    rekeyed[finalFieldKeyByOriginalKey.get(key) ?? key] = value;
  }
  return rekeyed;
}

/**
 * Creates and persists one planned text resource: reads + converts its
 * `content.rtf` (Task 3), seeds its sidecar `userMetadata` from the metadata
 * plan's resolved per-document values, writes it (bulk-create pattern), and
 * writes its initial canonical revision. A `content.rtf` this cannot read is
 * recorded as an FR-8 skip and the resource is not created; any RTF features
 * Task 3 could not convert are recorded as further FR-8 skips regardless.
 *
 * @returns The created `TextResource`, or `undefined` when the resource was
 *   skipped entirely (unreadable `content.rtf`).
 */
async function createAndWriteResource(
  projectRoot: string,
  resourcePlan: ImportPlanResource,
  realIdByPlanId: Map<ImportPlanId, UUID>,
  resourceUserMetadata: ReadonlyMap<string, Readonly<Record<string, string>>>,
  finalFieldKeyByOriginalKey: ReadonlyMap<string, string>,
  skips: ImportReportSkip[],
): Promise<TextResource | undefined> {
  let rtfText: string;
  try {
    rtfText = await readFile(resourcePlan.contentRtfPath, "utf8");
  } catch (err) {
    skips.push({
      itemTitle: resourcePlan.name,
      binderPath: resourcePlan.binderPath,
      reason: `content.rtf could not be read: ${(err as Error).message}`,
    });
    return undefined;
  }

  const { tiptap, plainText, droppedFeatures } = convertRtfToTiptap(rtfText);
  for (const dropped of droppedFeatures) {
    skips.push({
      itemTitle: resourcePlan.name,
      binderPath: resourcePlan.binderPath,
      reason: dropped.detail,
    });
  }

  const realParentId =
    resourcePlan.parentId === null
      ? null
      : (realIdByPlanId.get(resourcePlan.parentId) ?? null);
  const userMetadata = applyFieldKeyRenames(
    resourceUserMetadata.get(resourcePlan.sourceUuid),
    finalFieldKeyByOriginalKey,
  );

  const resource = createTextResource({
    name: resourcePlan.name,
    folderId: realParentId,
    plainText,
    tiptap,
    orderIndex: resourcePlan.orderIndex,
    userMetadata: userMetadata
      ? (userMetadata as Record<string, MetadataValue>)
      : undefined,
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
 * Reads a resource's sibling `synopsis.txt`/`notes.rtf` (if present, next to
 * its `content.rtf`) and applies them to its sidecar via Task 7's
 * `applyDocumentMetadata` (FR-5).
 */
async function applySynopsisAndNotes(
  projectRoot: string,
  resourcePlan: ImportPlanResource,
  resourceId: UUID,
): Promise<DocumentMetadataFlags> {
  const dataDir = path.dirname(resourcePlan.contentRtfPath);

  let synopsis: string | undefined;
  const synopsisPath = path.join(dataDir, "synopsis.txt");
  if (await exists(synopsisPath)) {
    synopsis = await readFile(synopsisPath, "utf8");
  }

  let notesRtf: string | undefined;
  const notesPath = path.join(dataDir, "notes.rtf");
  if (await exists(notesPath)) {
    notesRtf = await readFile(notesPath, "utf8");
  }

  const result = await applyDocumentMetadata(projectRoot, resourceId, {
    synopsis,
    notesRtf,
  });
  return { hasSynopsis: result.hasSynopsis, hasNotes: result.hasNotes };
}

/** Flattens the entire source binder tree (every item, regardless of type or exclusion) into a UUID -> Title map, for the FR-9(f) snapshot section. */
function buildUuidTitleIndex(
  items: readonly ScrivxBinderItem[],
  index: Map<string, string> = new Map(),
): Map<string, string> {
  for (const item of items) {
    index.set(item.uuid, item.title);
    if (item.children.length > 0) buildUuidTitleIndex(item.children, index);
  }
  return index;
}

/**
 * Scans the source project's `Snapshots/<uuid>.snapshots/*.rtf` directory
 * (FR-9(f)), never mutating anything under it.
 */
async function scanSnapshots(
  packageDir: string,
  titleByUuid: ReadonlyMap<string, string>,
): Promise<ImportReportSnapshot[]> {
  const snapshotsDir = path.join(packageDir, "Snapshots");
  if (!(await exists(snapshotsDir))) return [];

  const snapshots: ImportReportSnapshot[] = [];
  const entries = (await readdir(snapshotsDir)) as string[];
  for (const entry of entries.sort()) {
    const match = /^(.+)\.snapshots$/.exec(entry);
    if (!match) continue;
    const uuid = match[1];
    const resourceTitle = titleByUuid.get(uuid) ?? uuid;
    const entryDir = path.join(snapshotsDir, entry);
    let files: string[];
    try {
      files = (await readdir(entryDir)) as string[];
    } catch {
      continue;
    }
    for (const file of files
      .filter((f) => f.toLowerCase().endsWith(".rtf"))
      .sort()) {
      snapshots.push({
        resourceTitle,
        snapshotFile: path.relative(packageDir, path.join(entryDir, file)),
      });
    }
  }
  return snapshots;
}

/**
 * Rebuilds the destination project's inverted index, backlinks, and entity
 * mention index from scratch, mirroring `cli/src/commands/reindex.ts:23-60`
 * (FR-11).
 */
async function rebuildIndexes(projectRoot: string): Promise<void> {
  const resourceIds = await listResourceIds(projectRoot);
  const now = new Date().toISOString();
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
      createdAt: now,
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

const scrivenerImporter = { importScrivenerProject };
export default scrivenerImporter;
