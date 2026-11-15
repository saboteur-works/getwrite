/**
 * @module citations-precheck-core
 *
 * Feature 116 (citations at compile), FR-15, FR-17 and FR-22: the pre-run
 * check. Over the citations of the resources about to be compiled it reports
 * each citation that cannot be rendered in full: its Source is removed (in
 * Trash or purged), its Source could not be checked, or the Source lacks a
 * detail the style needs.
 *
 * - Input is `projectId` and `resourceIds` only; no path is accepted. Both are
 *   validated before any read. Nothing is written.
 * - Reads go through the storage adapter (`io.ts`, `sidecar.ts`); `node:*` is
 *   not imported, so a hosted tenant's `StorageContext` scopes the read.
 * - The "missing detail" test is injected (`MissingDetailFn`); the default
 *   reports none. `requiredDetailsCheck(styleId)` builds the injectable test
 *   from the hand-written table in `citations-required-details.ts`, the same
 *   `findMissingDetails` the editor line reads (Task 44). A Source with no
 *   fields has no reference type, so every detail any type needs is reported.
 * - A citation is as `citations-collect.ts` defines it. A Source in Trash and
 *   a purged Source are both "removed": no sidecar under `resources/`.
 * - A read that fails is never an empty result. A listed resource that cannot
 *   be read, is missing or has malformed annotations gives a `failed` result.
 *   A cited Source that cannot be read, or whose stored fields are not valid,
 *   is reported `could-not-be-checked`. A failure message is a fixed sentence
 *   carrying no stored content and no client input.
 * - A locked-access error is rethrown unchanged, so a locked project is never
 *   an empty, partial or failed result.
 * - `citationCount` is the number of citations with a gap (not all citations);
 *   gaps are ordered so that each Source's gaps are contiguous, Sources in
 *   order of first appearance.
 *
 * Reachable from `core.ts`, the CLI and the Electron workers: no React, JSX
 * or JSON.
 */
import { readFile } from "./io";
import { isLockedAccessError } from "./locked-access";
import { InvalidProjectIdCoreError } from "./project-id-core-error";
import { PROJECT_FILENAME } from "./project-config";
import { resolveProjectRoot } from "./project-root-resolver";
import { readSidecar } from "./sidecar";
import { UUID as UuidSchema } from "./schemas";
import { collectCitations, type CollectedCitation } from "./citations-collect";
import {
  validateCitationFields,
  type CitationFields,
} from "./citations-fields-validation";
import { CITATION_FIELDS_KEY } from "./citations-types";
import type { CitationCheckResult, CitationGap } from "./citations-types";
import { deriveCitationTargetState } from "./citation-target-state";
import {
  findMissingDetails,
  REQUIRED_DETAILS_BY_STYLE,
  type RequiredDetailsStyleId,
} from "./citations-required-details";
import type { Annotation, MetadataValue } from "./types";

export { InvalidProjectIdCoreError };

/** The project does not exist in the caller's storage scope. Map to HTTP 404. */
export class CitationCheckProjectNotFoundError extends Error {
  constructor() {
    super("The project was not found.");
    this.name = "CitationCheckProjectNotFoundError";
  }
}

/** A resource id is not well formed. Map to HTTP 400; never echoes the id. */
export class InvalidCitationCheckResourceIdError extends Error {
  constructor() {
    super("A resource id must be a valid id.");
    this.name = "InvalidCitationCheckResourceIdError";
  }
}

/**
 * The names of the details the style needs that a Source lacks. `fields` is
 * null when the Source has no citation fields at all.
 */
export type MissingDetailFn = (
  fields: CitationFields | null,
  citation: CollectedCitation,
) => readonly string[];

export interface CitationCheckOptions {
  /** Defaults to reporting no missing detail. */
  missingDetails?: MissingDetailFn;
}

/**
 * The missing-detail test backed by the required-details table of the given
 * style. Pass it as `options.missingDetails`.
 *
 * @param styleId - A bundled style the table covers.
 */
export function requiredDetailsCheck(
  styleId: RequiredDetailsStyleId,
): MissingDetailFn {
  return (fields) => {
    if (fields !== null) return findMissingDetails(styleId, fields);
    const labels = Object.values(REQUIRED_DETAILS_BY_STYLE[styleId])
      .flat()
      .map((detail) => detail.label);
    return [...new Set(labels)];
  };
}

const READ_FAILED_MESSAGE = "The citations could not be read.";

const NO_MISSING_DETAIL: MissingDetailFn = () => [];

type SourceFacts =
  | { kind: "removed" }
  | { kind: "unreadable" }
  | { kind: "present"; name: string; fields: CitationFields | null };

type ResourceRead =
  | { kind: "read"; citations: CollectedCitation[] }
  | { kind: "failed" };

async function assertProjectExists(projectRoot: string): Promise<void> {
  try {
    await readFile(`${projectRoot}/${PROJECT_FILENAME}`, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CitationCheckProjectNotFoundError();
    }
    throw err;
  }
}

function toResourceId(id: string): string {
  const parsed = UuidSchema.safeParse(id);
  if (!parsed.success) throw new InvalidCitationCheckResourceIdError();
  return parsed.data;
}

async function readResourceCitations(
  projectRoot: string,
  resourceId: string,
): Promise<ResourceRead> {
  let sidecar: Record<string, MetadataValue> | null;
  try {
    sidecar = await readSidecar(projectRoot, resourceId);
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    return { kind: "failed" };
  }
  if (sidecar === null) return { kind: "failed" };
  if (sidecar.type !== "text" && sidecar.type !== "source") {
    return { kind: "read", citations: [] };
  }
  const stored: unknown = sidecar.annotations;
  if (stored === undefined) return { kind: "read", citations: [] };
  if (!Array.isArray(stored)) return { kind: "failed" };
  const citations = collectCitations({
    resourceId,
    included: true,
    annotations: stored as Annotation[],
    excerptAnnotationsBySource: {},
  });
  return { kind: "read", citations };
}

async function readSourceFacts(
  projectRoot: string,
  sourceId: string,
): Promise<SourceFacts> {
  const parsed = UuidSchema.safeParse(sourceId);
  if (!parsed.success) return { kind: "unreadable" };
  let sidecar: Record<string, MetadataValue> | null;
  try {
    sidecar = await readSidecar(projectRoot, parsed.data);
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    return { kind: "unreadable" };
  }
  if (sidecar === null) return { kind: "removed" };
  const name = typeof sidecar.name === "string" ? sidecar.name : "";
  const storedFields: unknown = sidecar[CITATION_FIELDS_KEY];
  if (storedFields === undefined)
    return { kind: "present", name, fields: null };
  const validation = validateCitationFields(storedFields);
  if (!validation.ok) return { kind: "unreadable" };
  return { kind: "present", name, fields: validation.value };
}

function gapFor(
  citation: CollectedCitation,
  facts: SourceFacts,
  missingDetails: MissingDetailFn,
): CitationGap | null {
  const base = { resourceId: citation.resourceId, sourceId: citation.sourceId };
  if (facts.kind === "unreadable") {
    return {
      kind: "could-not-be-checked",
      ...base,
      ...(citation.sourceName === undefined
        ? {}
        : { sourceName: citation.sourceName }),
    };
  }
  const view = deriveCitationTargetState(
    { sourceId: citation.sourceId, sourceName: citation.sourceName },
    facts.kind === "removed"
      ? { source: "absent" }
      : { source: "present", currentSourceName: facts.name },
  );
  const sourceName = view.displayName === "" ? undefined : view.displayName;
  const named = sourceName === undefined ? {} : { sourceName };
  if (facts.kind === "removed") {
    return { kind: "source-removed", ...base, ...named };
  }
  const details = missingDetails(facts.fields, citation);
  if (details.length === 0) return null;
  return {
    kind: "missing-detail",
    ...base,
    ...named,
    missingDetails: [...details],
  };
}

/** Order gaps so each Source's gaps are contiguous, by first appearance. */
function groupBySource(gaps: readonly CitationGap[]): CitationGap[] {
  const bySource = new Map<string, CitationGap[]>();
  for (const gap of gaps) {
    const list = bySource.get(gap.sourceId);
    if (list === undefined) bySource.set(gap.sourceId, [gap]);
    else list.push(gap);
  }
  return [...bySource.values()].flat();
}

/**
 * Check the citations of the listed resources.
 *
 * @param projectId Server-validated project id.
 * @param resourceIds Ids of the resources about to be compiled.
 * @param options Injected missing-detail test.
 * @throws InvalidProjectIdCoreError, InvalidCitationCheckResourceIdError,
 *   CitationCheckProjectNotFoundError, and a locked-access error unchanged.
 */
export async function checkCitationsCore(
  projectId: string,
  resourceIds: readonly string[],
  options: CitationCheckOptions = {},
): Promise<CitationCheckResult> {
  const projectRoot = resolveProjectRoot(projectId);
  if (!projectRoot) throw new InvalidProjectIdCoreError(projectId);
  const ids = [...new Set(resourceIds.map(toResourceId))];
  await assertProjectExists(projectRoot);
  const missingDetails = options.missingDetails ?? NO_MISSING_DETAIL;

  const citations: CollectedCitation[] = [];
  for (const id of ids) {
    const read = await readResourceCitations(projectRoot, id);
    if (read.kind === "failed") {
      return {
        status: "failed",
        failure: "read-failed",
        message: READ_FAILED_MESSAGE,
      };
    }
    citations.push(...read.citations);
  }

  const facts = new Map<string, SourceFacts>();
  const gaps: CitationGap[] = [];
  for (const citation of citations) {
    let known = facts.get(citation.sourceId);
    if (known === undefined) {
      known = await readSourceFacts(projectRoot, citation.sourceId);
      facts.set(citation.sourceId, known);
    }
    const gap = gapFor(citation, known, missingDetails);
    if (gap !== null) gaps.push(gap);
  }
  const grouped = groupBySource(gaps);
  return {
    status: "ok",
    gaps: grouped,
    citationCount: grouped.length,
    incompleteSourceCount: new Set(grouped.map((g) => g.sourceId)).size,
  };
}
