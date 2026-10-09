/**
 * @module revision-repair
 *
 * One-time repair for text resources that have content but no revision.
 *
 * The editor autosaves only into a canonical revision, so edits typed into
 * such a resource are not saved (measured 2026-10-08). Two closed sources are
 * known: resources created before the app wrote a revision at creation, and
 * copies made before copies got one. Nothing creates them today.
 */
import path from "node:path";
import { readdir } from "./io";
import { getLocalResources } from "./resource-persistence";
import { writeInitialCanonicalRevision } from "./resource-initial-revision";
import { revisionsBaseDir } from "./revision";
import { plainTextToTipTapDocument } from "./tiptap-doc";
import { loadResourceContent } from "../tiptap-utils";

export interface RevisionRepairEntry {
  id: string;
  name: string;
}

export interface RevisionRepairSkip extends RevisionRepairEntry {
  reason: string;
}

export interface RevisionRepairReport {
  /** Repaired, or in a dry run, the resources a real run would repair. */
  repaired: RevisionRepairEntry[];
  /** Revision-less text resources that could not be repaired. */
  skipped: RevisionRepairSkip[];
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "ENOENT"
  );
}

/**
 * True when any `v-*` entry exists under the resource's revisions directory.
 * A revision whose metadata is unreadable still counts: writing `v-1` over a
 * damaged revision would destroy what is left of it.
 */
async function hasAnyRevisionDirectory(
  projectRoot: string,
  resourceId: string,
): Promise<boolean> {
  try {
    const entries = await readdir(revisionsBaseDir(projectRoot, resourceId));
    return entries.some((entry) => path.basename(entry).startsWith("v-"));
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

/**
 * Writes an initial canonical revision for every text resource in the project
 * that has content files and no revision directory. The revision holds the
 * resource's own document. Resources that already have any revision, and
 * image and audio resources, are left alone.
 *
 * @throws A locked-access error when the project is locked or keyless.
 */
export async function repairMissingInitialRevisions(
  projectRoot: string,
  opts: { dryRun?: boolean } = {},
): Promise<RevisionRepairReport> {
  const report: RevisionRepairReport = { repaired: [], skipped: [] };

  for (const resource of await getLocalResources(projectRoot)) {
    if (resource.type !== "text") continue;
    if (await hasAnyRevisionDirectory(projectRoot, resource.id)) continue;

    const entry = { id: resource.id, name: resource.name };
    const content = await loadResourceContent(projectRoot, resource.id);
    if (content.tiptap === undefined && content.plainText === undefined) {
      report.skipped.push({ ...entry, reason: "no content files" });
      continue;
    }

    if (!opts.dryRun) {
      await writeInitialCanonicalRevision(
        projectRoot,
        resource.id,
        content.tiptap ?? plainTextToTipTapDocument(content.plainText ?? ""),
      );
    }
    report.repaired.push(entry);
  }

  return report;
}
