import type { AnyResource } from "./models/types";

export type StatusRollupRowKind = "configured" | "unknown" | "unset";

export interface StatusRollupRow {
  /** Display label. Unknown rows say, as text, that the value is not in the current list. */
  label: string;
  kind: StatusRollupRowKind;
  resourceCount: number;
  words: number;
}

export const UNSET_STATUS_LABEL = "No status";

/** Label for a status value present on resources but absent from `config.statuses`. */
export function unknownStatusLabel(value: string): string {
  return `${value} (not in the current list)`;
}

type ResourceWithWordCount = AnyResource & {
  userMetadata?: { wordCount?: number };
  wordCount?: number;
};

/**
 * Same source as `DataView`'s `getWordCount` (kept as a duplicate one-liner so
 * DataView is untouched; equality is pinned in the unit test).
 */
function getResourceWordCount(r: AnyResource): number {
  const rc = r as ResourceWithWordCount;
  return rc.userMetadata?.wordCount ?? rc.wordCount ?? 0;
}

/** Only `userMetadata.status` is read; absent or non-string is unset. */
function getStatus(r: AnyResource): string | undefined {
  const value: unknown = r.userMetadata?.status;
  return typeof value === "string" ? value : undefined;
}

interface Tally {
  resourceCount: number;
  words: number;
}

/**
 * Roll text resources up by status: configured statuses in order, then
 * unknown values in first-seen order, then a final "No status" row.
 */
export function computeStatusRollup(
  resources: readonly AnyResource[],
  statuses: readonly string[],
): StatusRollupRow[] {
  const configured = new Set(statuses);
  const byStatus = new Map<string, Tally>();
  const unset: Tally = { resourceCount: 0, words: 0 };

  for (const r of resources) {
    if (r.type !== "text") continue;
    const status = getStatus(r);
    let tally: Tally;
    if (status === undefined) {
      tally = unset;
    } else {
      const existing = byStatus.get(status);
      tally = existing ?? { resourceCount: 0, words: 0 };
      if (!existing) byStatus.set(status, tally);
    }
    tally.resourceCount += 1;
    tally.words += getResourceWordCount(r);
  }

  const zero: Tally = { resourceCount: 0, words: 0 };
  const rows: StatusRollupRow[] = [];
  for (const label of new Set(statuses)) {
    rows.push({ label, kind: "configured", ...(byStatus.get(label) ?? zero) });
  }
  for (const [value, tally] of byStatus) {
    if (configured.has(value)) continue;
    rows.push({ label: unknownStatusLabel(value), kind: "unknown", ...tally });
  }
  rows.push({ label: UNSET_STATUS_LABEL, kind: "unset", ...unset });
  return rows;
}
