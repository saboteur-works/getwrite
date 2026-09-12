// Last Updated: 2026-09-11

/**
 * @module binder-mapper
 *
 * Maps a parsed `.scrivx` binder tree (Task 2, `scrivx-parser.ts`) into an
 * ordered, path-aware import plan of GetWrite folders/resources, per
 * `specs/features/scrivener-cli-importer.md` FR-3, FR-13, FR-16, and FR-17.
 *
 * This is a pure planning function apart from one filesystem existence check
 * (FR-13's "does this `Folder`-type item have its own `content.rtf`?" test,
 * via `io.ts`'s `exists`, never `node:fs` directly, per
 * `docs/standards/storage-context.md` §5). No RTF is converted and nothing
 * is written to a destination project here — that is Task 3 (already done)
 * and Task 8 (the orchestrator), respectively. Each planned resource only
 * carries a reference to the source binder item and its `content.rtf` path
 * so Task 8 can do the actual conversion and creation.
 *
 * **Folder identity**: every planned folder gets a plan-local generated id
 * (`generateUUID()`, the same generator `project-creator.ts:248-272` uses
 * for real folder ids) and a `parentId` pointing at another planned folder's
 * id (or `null` for the project root). Folder identity is deliberately
 * tracked this way rather than by slug-matching a folder's name against
 * `project-creator.ts`'s `defaultFolders` (`project-creator.ts:276-282`),
 * since two same-named folders in different branches of the binder (e.g. two
 * "Notes" folders under different chapters) must not collide or be treated
 * as the same destination folder.
 *
 * **FR-13 nesting**: a `Folder`-type binder item that itself has its own
 * `Files/Data/<uuid>/content.rtf` on disk becomes a GetWrite folder whose
 * first child is a text resource named after the folder, holding that
 * converted text. A `Text`-type binder item that itself has child binder
 * items becomes a GetWrite folder of the same name, containing the
 * document's own text as its first child resource, followed by its
 * converted children in binder order. Both cases are implemented by
 * `mapFolderItem`/`mapTextItem` below, which assign the synthesized "own
 * text" resource `orderIndex: 0` among the folder's children before any
 * subfolders/resources converted from the item's own binder children.
 *
 * **Root-level title collision (owner-accepted decision, undocumented by the
 * spec):** the spec does not define what happens when a Draft item placed
 * at the project root (FR-3: no wrapper folder) shares a title with the
 * synthetic top-level "Research" folder (FR-16) or with another top-level
 * user folder (FR-17). Overwriting or merging either party's prose is
 * destructive and is never done. Instead, the *non-Draft* party (Research or
 * the colliding user folder) has its top-level name suffixed (`"Research
 * (2)"`, `"Research (3)"`, ...) to stay unique among root-level plan items,
 * and the suffixing is recorded in `ScrivenerImportPlan.notes` for the FR-9
 * report — Draft content itself is never renamed. This same suffixing logic
 * is applied generally to any later root-level item colliding with an
 * earlier one (e.g. two same-named FR-17 user folders), which is a safe
 * generalization of the documented decision: it only ever adds a numeric
 * suffix, never merges or drops content.
 */
import path from "node:path";
import { exists } from "../io";
import { generateUUID } from "../uuid";
import type { ScrivxBinderItem, ScrivxParsed } from "./scrivx-types";

/** Plan-local id assigned to a planned folder or resource. Not a real GetWrite UUID until Task 8 creates it. */
export type ImportPlanId = string;

/**
 * A single GetWrite folder to be created by Task 8's orchestrator.
 */
export interface ImportPlanFolder {
  /** Plan-local id, referenced by this folder's own children via `parentId`. */
  readonly id: ImportPlanId;
  /** Folder display name. May differ from the source binder item's title only via the root-level collision suffix (see module doc). */
  readonly name: string;
  /** Parent plan folder id, or `null` for a top-level (project-root) folder. */
  readonly parentId: ImportPlanId | null;
  /** Position among this folder's siblings (other folders/resources sharing the same `parentId`), in binder order. */
  readonly orderIndex: number;
  /**
   * The originating binder item's `UUID`, when this folder corresponds
   * one-to-one to a single binder item (every case except the synthetic
   * top-level "Research" folder, which has no binder item of its own).
   */
  readonly sourceUuid: string | null;
  /** This item's position in the source binder, e.g. `"Draft/Chapter One"`, for the FR-9 report. */
  readonly binderPath: string;
}

/**
 * A single GetWrite text resource to be created by Task 8's orchestrator.
 * References its source `content.rtf` rather than embedding converted
 * content — Task 3's `convertRtfToTiptap` does the actual conversion.
 */
export interface ImportPlanResource {
  /** Plan-local id. */
  readonly id: ImportPlanId;
  /** Resource display name. */
  readonly name: string;
  /** Parent plan folder id, or `null` for a project-root resource. */
  readonly parentId: ImportPlanId | null;
  /** Position among this resource's siblings (other folders/resources sharing the same `parentId`), in binder order. */
  readonly orderIndex: number;
  /** The originating binder item's `UUID`. */
  readonly sourceUuid: string;
  /** Absolute path to the source `Files/Data/<uuid>/content.rtf` this resource's content should be converted from. */
  readonly contentRtfPath: string;
  /** This item's position in the source binder, for the FR-9 report. */
  readonly binderPath: string;
}

/** Reason a binder item was excluded from the plan (FR-3). */
export type ImportPlanExclusionReason = "trash" | "other-type";

/**
 * A single binder item excluded from the plan per FR-3: every item found
 * under `TrashFolder` (`reason: "trash"`), and every `Type="Other"` item
 * wherever it occurs in the binder (`reason: "other-type"`).
 */
export interface ImportPlanExcludedItem {
  /** The item's title as it appeared in Scrivener. */
  readonly itemTitle: string;
  /** The item's position in the binder. */
  readonly binderPath: string;
  /** Why the item was excluded. */
  readonly reason: ImportPlanExclusionReason;
}

/**
 * A single non-text Research item (FR-16: anything under `ResearchFolder`
 * that is not itself `Folder`/`Text`, i.e. `Type="Other"`) left
 * unconverted. Every entry here also appears in `excluded` with
 * `reason: "other-type"` — the two lists serve distinct FR-9 report
 * sections (`ImportReportResearchItem` vs `ImportReportExcludedOtherItem`
 * in `import-report.ts`), not mutually exclusive categories.
 */
export interface ImportPlanNonTextResearchItem {
  /** The item's title as it appeared in Scrivener. */
  readonly itemTitle: string;
  /** The item's position in the binder. */
  readonly binderPath: string;
}

/**
 * A note about a decision the mapper made that a human should see in the
 * FR-9 report — currently only ever a root-level title collision suffix
 * (see module doc).
 */
export interface ImportPlanNote {
  /** Human-readable description of the decision made. */
  readonly message: string;
}

/**
 * A single binder item that had no `<Title>` element and was imported under
 * a generated fallback name (FR-19, OQ-10). Field names mirror
 * `ImportReportResearchItem`/`ImportReportExcludedOtherItem`'s
 * `itemTitle`/`binderPath` shape so a later task can flow this list straight
 * into the FR-9 report.
 */
export interface ImportPlanUntitledFallback {
  /** The fallback name actually used ("Untitled", "Untitled 2", ...). */
  readonly itemTitle: string;
  /** This item's position in the binder, using the fallback name for its own segment. */
  readonly binderPath: string;
}

/**
 * The full ordered, path-aware import plan `mapBinderToImportPlan` returns.
 */
export interface ScrivenerImportPlan {
  /** Every GetWrite folder to create, in no particular array order (use `parentId`/`orderIndex` to reconstruct the tree). */
  readonly folders: readonly ImportPlanFolder[];
  /** Every GetWrite text resource to create. */
  readonly resources: readonly ImportPlanResource[];
  /** Every excluded binder item (FR-3), for the FR-9 report. */
  readonly excluded: readonly ImportPlanExcludedItem[];
  /** Every non-text Research item (FR-16), for the FR-9 report. */
  readonly nonTextResearch: readonly ImportPlanNonTextResearchItem[];
  /** Any root-level title-collision suffixing performed (see module doc), for the FR-9 report. */
  readonly notes: readonly ImportPlanNote[];
  /** Every binder item imported under a generated "Untitled" fallback name (FR-19), for the FR-9 report. */
  readonly untitledFallbacks: readonly ImportPlanUntitledFallback[];
}

/**
 * Mutable accumulator threaded through the recursive mapping helpers below.
 * Kept as a single object so every helper appends to the same four lists
 * rather than needing to merge partial results back up the recursion.
 */
interface PlanBuilder {
  readonly folders: ImportPlanFolder[];
  readonly resources: ImportPlanResource[];
  readonly excluded: ImportPlanExcludedItem[];
  readonly nonTextResearch: ImportPlanNonTextResearchItem[];
  readonly notes: ImportPlanNote[];
  readonly untitledFallbacks: ImportPlanUntitledFallback[];
  /** Names already used by a root-level (project-root) plan folder/resource, for the collision check. */
  readonly rootNames: Set<string>;
}

/**
 * FR-19/OQ-10: computes each item's display title, replacing a missing
 * `<Title>` (`item.title === ""`) with a fallback name — "Untitled",
 * "Untitled 2", "Untitled 3", ... — de-duplicated only among the *other*
 * items in this same sibling list that also lack a title, in binder order.
 * An item that has a title is returned unchanged.
 */
function resolveSiblingTitles(items: readonly ScrivxBinderItem[]): string[] {
  let untitledCount = 0;
  return items.map((item) => {
    if (item.title !== "") return item.title;
    untitledCount += 1;
    return untitledCount === 1 ? "Untitled" : `Untitled ${untitledCount}`;
  });
}

/**
 * Maps a parsed `.scrivx` binder tree into an ordered, path-aware import
 * plan (FR-3, FR-13, FR-16, FR-17).
 *
 * @param parsed - The parsed `.scrivx` project, as returned by `parseScrivxFile`.
 * @param scrivxPath - Absolute path to the source `.scrivx` file. Its parent
 *   directory (the `.scriv` package) is where `Files/Data/<uuid>/content.rtf`
 *   is resolved from for the FR-13 existence check and every resource's
 *   `contentRtfPath`.
 * @returns The import plan.
 */
export async function mapBinderToImportPlan(
  parsed: ScrivxParsed,
  scrivxPath: string,
): Promise<ScrivenerImportPlan> {
  const packageDir = path.dirname(scrivxPath);
  const builder: PlanBuilder = {
    folders: [],
    resources: [],
    excluded: [],
    nonTextResearch: [],
    notes: [],
    untitledFallbacks: [],
    rootNames: new Set<string>(),
  };

  let rootOrderIndex = 0;
  const rootTitles = resolveSiblingTitles(parsed.binder);

  for (let i = 0; i < parsed.binder.length; i++) {
    const item = parsed.binder[i];
    const resolvedTitle = rootTitles[i];
    switch (item.type) {
      case "DraftFolder":
        rootOrderIndex = await mapChildren(
          item.children,
          null,
          resolvedTitle,
          false,
          rootOrderIndex,
          packageDir,
          builder,
        );
        break;

      case "ResearchFolder": {
        const resolvedName = resolveRootCollision("Research", builder);
        const folderId = generateUUID();
        pushFolder(builder, {
          id: folderId,
          name: resolvedName,
          parentId: null,
          orderIndex: rootOrderIndex++,
          sourceUuid: null,
          binderPath: resolvedTitle,
        });
        await mapChildren(
          item.children,
          folderId,
          resolvedTitle,
          true,
          0,
          packageDir,
          builder,
        );
        break;
      }

      case "TrashFolder":
        collectExcludedDescendants(
          item.children,
          resolvedTitle,
          "trash",
          builder,
        );
        break;

      case "Other":
        recordExcludedOther(item, resolvedTitle, builder, false);
        collectExcludedDescendants(
          item.children,
          resolvedTitle,
          "other-type",
          builder,
        );
        break;

      case "Folder":
      case "Text": {
        // FR-17: every other top-level binder item becomes its own
        // top-level GetWrite folder/resource (same FR-3/FR-13 rules as
        // everywhere else), preserving hierarchy.
        const resolvedName = resolveRootCollision(resolvedTitle, builder);
        if (item.title === "") {
          builder.untitledFallbacks.push({
            itemTitle: resolvedName,
            binderPath: resolvedTitle,
          });
        }
        rootOrderIndex = await mapSingleItem(
          item,
          null,
          resolvedTitle,
          rootOrderIndex,
          false,
          packageDir,
          builder,
          resolvedName,
        );
        break;
      }
    }
  }

  return {
    folders: builder.folders,
    resources: builder.resources,
    excluded: builder.excluded,
    nonTextResearch: builder.nonTextResearch,
    notes: builder.notes,
    untitledFallbacks: builder.untitledFallbacks,
  };
}

/**
 * Maps an ordered list of sibling binder items into plan folders/resources
 * under `parentId`, starting at `startOrderIndex`. Excluded items
 * (`Type="Other"`) consume no order index.
 *
 * @returns The next unused order index (for a caller that continues
 *   appending further siblings after this list, e.g. the project root).
 */
async function mapChildren(
  items: readonly ScrivxBinderItem[],
  parentId: ImportPlanId | null,
  binderPathPrefix: string,
  inResearch: boolean,
  startOrderIndex: number,
  packageDir: string,
  builder: PlanBuilder,
): Promise<number> {
  let orderIndex = startOrderIndex;
  const titles = resolveSiblingTitles(items);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const resolvedTitle = titles[i];
    const binderPath = `${binderPathPrefix}/${resolvedTitle}`;
    if (item.type === "Other") {
      recordExcludedOther(item, binderPath, builder, inResearch);
      collectExcludedDescendants(
        item.children,
        binderPath,
        "other-type",
        builder,
      );
      continue;
    }
    if (item.title === "") {
      builder.untitledFallbacks.push({ itemTitle: resolvedTitle, binderPath });
    }
    orderIndex = await mapSingleItem(
      item,
      parentId,
      binderPath,
      orderIndex,
      inResearch,
      packageDir,
      builder,
      resolvedTitle,
    );
  }
  return orderIndex;
}

/**
 * Maps one `Folder`- or `Text`-type binder item (never `Other` — callers
 * filter that out first) to a plan folder or resource at `orderIndex` under
 * `parentId`, applying FR-13's nesting rules, and returns the next unused
 * sibling order index.
 *
 * @param displayName - Overrides `item.title` for the created folder's/
 *   resource's `name` (used only for the FR-17 root-collision suffix — the
 *   `binderPath` always reflects the item's real source title).
 */
async function mapSingleItem(
  item: ScrivxBinderItem,
  parentId: ImportPlanId | null,
  binderPath: string,
  orderIndex: number,
  inResearch: boolean,
  packageDir: string,
  builder: PlanBuilder,
  displayName?: string,
): Promise<number> {
  const name = displayName ?? item.title;
  if (item.type === "Folder") {
    await mapFolderItem(
      item,
      parentId,
      name,
      binderPath,
      orderIndex,
      inResearch,
      packageDir,
      builder,
    );
    return orderIndex + 1;
  }
  // item.type === "Text"
  await mapTextItem(
    item,
    parentId,
    name,
    binderPath,
    orderIndex,
    inResearch,
    packageDir,
    builder,
  );
  return orderIndex + 1;
}

/**
 * FR-13: a `Folder`-type item that itself has its own `content.rtf` on disk
 * becomes a GetWrite folder whose first child is a text resource named
 * after the folder, holding that converted text — checked via the one
 * filesystem existence check this module performs.
 */
async function mapFolderItem(
  item: ScrivxBinderItem,
  parentId: ImportPlanId | null,
  name: string,
  binderPath: string,
  orderIndex: number,
  inResearch: boolean,
  packageDir: string,
  builder: PlanBuilder,
): Promise<void> {
  const folderId = generateUUID();
  pushFolder(builder, {
    id: folderId,
    name,
    parentId,
    orderIndex,
    sourceUuid: item.uuid,
    binderPath,
  });

  let childOrderIndex = 0;
  const ownContentRtfPath = contentRtfPath(packageDir, item.uuid);
  if (await exists(ownContentRtfPath)) {
    builder.resources.push({
      id: generateUUID(),
      name,
      parentId: folderId,
      orderIndex: childOrderIndex++,
      sourceUuid: item.uuid,
      contentRtfPath: ownContentRtfPath,
      binderPath,
    });
  }

  await mapChildren(
    item.children,
    folderId,
    binderPath,
    inResearch,
    childOrderIndex,
    packageDir,
    builder,
  );
}

/**
 * FR-13: a `Text`-type item with no children is a plain resource. A
 * `Text`-type item that itself has child binder items becomes a GetWrite
 * folder of the same name, containing the document's own text as its first
 * child resource, followed by its converted children in binder order.
 */
async function mapTextItem(
  item: ScrivxBinderItem,
  parentId: ImportPlanId | null,
  name: string,
  binderPath: string,
  orderIndex: number,
  inResearch: boolean,
  packageDir: string,
  builder: PlanBuilder,
): Promise<void> {
  const ownContentRtfPath = contentRtfPath(packageDir, item.uuid);

  if (item.children.length === 0) {
    builder.resources.push({
      id: generateUUID(),
      name,
      parentId,
      orderIndex,
      sourceUuid: item.uuid,
      contentRtfPath: ownContentRtfPath,
      binderPath,
    });
    if (parentId === null) builder.rootNames.add(name);
    return;
  }

  const folderId = generateUUID();
  pushFolder(builder, {
    id: folderId,
    name,
    parentId,
    orderIndex,
    sourceUuid: item.uuid,
    binderPath,
  });
  builder.resources.push({
    id: generateUUID(),
    name,
    parentId: folderId,
    orderIndex: 0,
    sourceUuid: item.uuid,
    contentRtfPath: ownContentRtfPath,
    binderPath,
  });

  await mapChildren(
    item.children,
    folderId,
    binderPath,
    inResearch,
    1,
    packageDir,
    builder,
  );
}

function pushFolder(builder: PlanBuilder, folder: ImportPlanFolder): void {
  builder.folders.push(folder);
  if (folder.parentId === null) builder.rootNames.add(folder.name);
}

function recordExcludedOther(
  item: ScrivxBinderItem,
  binderPath: string,
  builder: PlanBuilder,
  inResearch: boolean,
): void {
  builder.excluded.push({
    itemTitle: item.title,
    binderPath,
    reason: "other-type",
  });
  if (inResearch) {
    builder.nonTextResearch.push({ itemTitle: item.title, binderPath });
  }
}

/**
 * Recursively records every descendant of an already-excluded subtree
 * (`TrashFolder`'s children, or a `Type="Other"` item's own children) as
 * excluded too, since nothing beneath an excluded item is converted either.
 */
function collectExcludedDescendants(
  items: readonly ScrivxBinderItem[],
  binderPathPrefix: string,
  reason: ImportPlanExclusionReason,
  builder: PlanBuilder,
): void {
  for (const item of items) {
    const binderPath = `${binderPathPrefix}/${item.title}`;
    builder.excluded.push({ itemTitle: item.title, binderPath, reason });
    collectExcludedDescendants(item.children, binderPath, reason, builder);
  }
}

/**
 * Owner-accepted collision decision (see module doc): if `candidateName` is
 * already used by another root-level plan folder/resource, suffix it
 * (`"Name (2)"`, `"Name (3)"`, ...) until unique, and record a note. Draft
 * content is never passed through this function as the party being
 * renamed — only Research's synthetic folder name and FR-17 user top-level
 * folder names are.
 */
function resolveRootCollision(
  candidateName: string,
  builder: PlanBuilder,
): string {
  if (!builder.rootNames.has(candidateName)) return candidateName;

  let suffix = 2;
  let resolved = `${candidateName} (${suffix})`;
  while (builder.rootNames.has(resolved)) {
    suffix += 1;
    resolved = `${candidateName} (${suffix})`;
  }

  builder.notes.push({
    message:
      `Renamed top-level folder "${candidateName}" to "${resolved}" to avoid ` +
      `colliding with an existing top-level item of the same name at the ` +
      `project root.`,
  });
  return resolved;
}

function contentRtfPath(packageDir: string, uuid: string): string {
  return path.join(packageDir, "Files", "Data", uuid, "content.rtf");
}
