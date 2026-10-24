/**
 * @module revision-summary
 *
 * Strips the server-side `filePath` from a revision before a route sends it
 * (task_d53cf256). Routes returned revisions as stored, so every client
 * received the absolute path of the revision file on the server.
 *
 * Leaf module with no Node imports.
 */
import type { Revision, RevisionSummary } from "./types";

/** Returns `revision` without `filePath`; any other fields are kept. */
export function toRevisionSummary<T extends Revision>(
  revision: T,
): Omit<T, "filePath"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { filePath: _filePath, ...summary } = revision;
  return summary;
}

/** {@link toRevisionSummary} over a list. */
export function toRevisionSummaries(
  revisions: readonly Revision[],
): RevisionSummary[] {
  return revisions.map(toRevisionSummary);
}
