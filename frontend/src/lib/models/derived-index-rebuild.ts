/**
 * @module derived-index-rebuild
 *
 * The one from-scratch rebuild of a project's derived indexes (Feature 103,
 * FR-8): the inverted index, backlinks and entity mention index, then the
 * index steps of every module enabled for the project. Shared by the three
 * importers (`rebuildIndexes` in the Scrivener, DOCX and plaintext importers)
 * and the CLI's `reindex`, which each carried a hand-written copy.
 *
 * It also rebuilds the annotation-body index (`meta/index/annotations.json`,
 * FR-9) from the sidecars, as a save does: the file is dropped and rewritten
 * from every stored body, so a stale entry goes and a missing one returns.
 * Annotation indexing is core, not module-owned. It does not rebuild prose
 * diagnostics (`meta/index/diagnostics.json`, OQ-11).
 *
 * A locked-access error at any read of the rebuild is rethrown, so a locked
 * project fails the rebuild rather than indexing nothing; the callers (the
 * importers, the CLI's `reindex`) surface it.
 *
 * Reachable from `core.ts`, the CLI and the Electron import workers (FR-4), so
 * it imports no React, JSX or JSON.
 */
import path from "node:path";
import { readFile, rm } from "./io";
import { withMetaLock } from "./meta-locks";
import {
  listResourceIds,
  computeBacklinks,
  persistBacklinks,
} from "./backlinks";
import { indexAnnotationBodies, indexResource } from "./inverted-index";
import { readSidecar } from "./sidecar";
import { isLockedAccessError } from "./locked-access";
import { buildEntityAliasTable } from "./entity-alias-table";
import { findMentionOffsets } from "./entity-detection";
import {
  persistMentionIndex,
  type MentionIndex,
  type MentionRecord,
} from "./mention-index";
import { loadResourceContent } from "../tiptap-utils";
import { MODULE_MANIFEST } from "./modules/manifest";
import { createModuleRegistry, type ModuleRegistry } from "./modules/registry";
import type { ProjectConfig, TextResource } from "./types";

export interface DerivedRebuildOptions {
  /** Modules whose index steps may run; defaults to the static manifest. */
  registry?: ModuleRegistry;
}

export interface DerivedRebuildResult {
  /** Every resource id found under `resources/`, in listing order. */
  resourceIds: string[];
  /** Plain text read for each resource (undefined when it could not be read). */
  plainTextById: ReadonlyMap<string, string | undefined>;
  /** Total mention records written (one per entity per resource). */
  mentionCount: number;
}

const DEFAULT_REGISTRY: ModuleRegistry = createModuleRegistry(MODULE_MANIFEST);

function isMissingEntryError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * Plain unlocked read of `config` from `project.json` (not `updateProjectJson`).
 * Shared with `indexer-queue.ts`'s per-save module gating (Feature 103, FR-6).
 * A missing file reads as no config (each module takes its default, OQ-13). Any other
 * failure, a locked project included, is rethrown: a failed read must not
 * render as "no module switched off".
 */
export async function readModulesConfig(
  projectRoot: string,
): Promise<Pick<ProjectConfig, "modules"> | undefined> {
  let raw: string;
  try {
    raw = await readFile(path.join(projectRoot, "project.json"), "utf8");
  } catch (err) {
    if (isMissingEntryError(err)) return undefined;
    throw err;
  }
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const config = (parsed as { config?: unknown }).config;
  if (typeof config !== "object" || config === null) return undefined;
  return config as Pick<ProjectConfig, "modules">;
}

async function indexAllResources(
  projectRoot: string,
  resourceIds: readonly string[],
): Promise<Map<string, string | undefined>> {
  const now = new Date().toISOString();
  const plainTextById = new Map<string, string | undefined>();

  for (const id of resourceIds) {
    let name = id;
    // A Source keeps its own type (FR-38); every other resource is indexed as
    // text. The indexer reads body and title, not the type.
    let resourceType: "text" | "source" = "text";
    try {
      const side = await readSidecar(projectRoot, id);
      if (side && (side as Record<string, unknown>).name) {
        name = String((side as Record<string, unknown>).name);
      }
      if (side && (side as Record<string, unknown>).type === "source") {
        resourceType = "source";
      }
    } catch (err) {
      // A locked project is not "no sidecar": rethrow, so the rebuild fails
      // instead of indexing every resource under its id.
      if (isLockedAccessError(err)) throw err;
      // Any other unreadable sidecar (corrupt JSON): index under the id, and
      // say so, so it does not pass for a resource that has no sidecar.
      console.error(
        `[reindex] sidecar of ${id} unreadable: indexed under its id`,
      );
    }

    let plainText: string | undefined;
    try {
      const loaded = await loadResourceContent(projectRoot, id);
      plainText = loaded.plainText ?? undefined;
    } catch (err) {
      // A locked project is not "no content": rethrow.
      if (isLockedAccessError(err)) throw err;
      // `loadResourceContent` already degrades a missing or unparseable file
      // itself; anything else leaves this resource's text unread (undefined,
      // as `DerivedRebuildResult.plainTextById` documents).
      console.error(`[reindex] content of ${id} unreadable: not indexed`);
    }
    plainTextById.set(id, plainText);

    const minimal = {
      id,
      name,
      type: resourceType,
      folderId: undefined,
      createdAt: now,
      plainText,
      tiptap: undefined,
    } as unknown as TextResource;

    await indexResource(projectRoot, minimal);
  }
  return plainTextById;
}

const ANNOTATION_INDEX_PATH = path.join("meta", "index", "annotations.json");

/** Every stored annotation body in a sidecar, attached or detached. */
function storedAnnotationBodies(
  side: Awaited<ReturnType<typeof readSidecar>>,
): string[] {
  const stored: unknown = side?.["annotations"];
  if (!Array.isArray(stored)) return [];
  return stored.flatMap((a: unknown) =>
    typeof (a as { body?: unknown } | null)?.body === "string"
      ? [(a as { body: string }).body]
      : [],
  );
}

/**
 * Rebuild the annotation-body index from scratch: drop the file under the
 * meta lock, then index each resource that has stored bodies, as a save does
 * (`indexer-queue.ts`). Bodies are read before the file is dropped. A locked
 * project is rethrown, so it never looks like "no annotations". A sidecar that
 * is unreadable for another reason (corrupt JSON) is reported on stderr and
 * its bodies are left out, as the rest of this rebuild already tolerates it.
 */
async function rebuildAnnotationIndex(
  projectRoot: string,
  resourceIds: readonly string[],
): Promise<void> {
  const bodiesById = new Map<string, string[]>();
  for (const id of resourceIds) {
    try {
      const bodies = storedAnnotationBodies(await readSidecar(projectRoot, id));
      if (bodies.length > 0) bodiesById.set(id, bodies);
    } catch (err) {
      if (isLockedAccessError(err)) throw err;
      console.error(
        `[reindex] annotation bodies of ${id} not indexed: sidecar unreadable`,
      );
    }
  }
  await withMetaLock(projectRoot, () =>
    rm(path.join(projectRoot, ANNOTATION_INDEX_PATH), { force: true }),
  );
  for (const [id, bodies] of bodiesById) {
    await indexAnnotationBodies(projectRoot, id, bodies);
  }
}

/**
 * Rebuild the mention index from scratch, mirroring `indexer-queue.ts`'s
 * per-resource aggregation (one record per entity per resource, offsets
 * combined across the entity's terms), persisted once at the end and not
 * merged with prior contents.
 */
async function rebuildMentionIndex(
  projectRoot: string,
  resourceIds: readonly string[],
  plainTextById: ReadonlyMap<string, string | undefined>,
): Promise<number> {
  const aliasTable = await buildEntityAliasTable(projectRoot);
  const mentionIndex: MentionIndex = {};
  let mentionCount = 0;

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
      mentionCount += records.length;
    }
  }

  await persistMentionIndex(projectRoot, mentionIndex);
  return mentionCount;
}

/**
 * Rebuild the inverted index, annotation-body index, backlinks and mention index of `projectRoot`
 * from the resources on disk, then run the index steps of enabled modules.
 * `config.modules` is read only when a registered module owns a step.
 */
export async function rebuildDerivedIndexes(
  projectRoot: string,
  options: DerivedRebuildOptions = {},
): Promise<DerivedRebuildResult> {
  const registry = options.registry ?? DEFAULT_REGISTRY;
  const resourceIds = await listResourceIds(projectRoot);
  const plainTextById = await indexAllResources(projectRoot, resourceIds);

  await rebuildAnnotationIndex(projectRoot, resourceIds);

  const backlinks = await computeBacklinks(projectRoot);
  await persistBacklinks(projectRoot, backlinks);

  const mentionCount = await rebuildMentionIndex(
    projectRoot,
    resourceIds,
    plainTextById,
  );

  if (registry.modules.some((m) => m.indexSteps.length > 0)) {
    const config = await readModulesConfig(projectRoot);
    for (const step of registry.indexSteps(config)) {
      await step.run(projectRoot);
    }
  }

  return { resourceIds, plainTextById, mentionCount };
}
