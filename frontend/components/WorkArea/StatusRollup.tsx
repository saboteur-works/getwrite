"use client";

import React from "react";
import type { AnyResource } from "../../src/lib/models/types";
import { computeStatusRollup } from "../../src/lib/status-rollup";

/** Working copy: every user-visible string of the roll-up, in one place. */
export const STATUS_ROLLUP_COPY = {
  scopeNote:
    "Text resources only, across the whole project. Not affected by the selected smart folder.",
  staleNote: "Word counts for some older resources may read low.",
  noResources: "No text resources yet.",
  noStatusesConfigured:
    "No statuses are configured for this project, so every resource shows under No status.",
  tableCaption: "Resources and words by status",
  statusHeader: "Status",
  resourcesHeader: "Resources",
  wordsHeader: "Words",
} as const;

export interface StatusRollupProps {
  /** Resources to roll up; non-text resources are ignored. */
  resources: readonly AnyResource[];
  /** The project's `config.statuses`, in display order. */
  statuses: readonly string[];
}

/**
 * Per-status resource count and word total, rendered as a real table so
 * screen readers announce count and words against each status.
 */
export default function StatusRollup({
  resources,
  statuses,
}: StatusRollupProps): JSX.Element {
  const rows = React.useMemo(
    () => computeStatusRollup(resources, statuses),
    [resources, statuses],
  );
  const hasTextResources = rows.some((r) => r.resourceCount > 0);

  return (
    <div>
      <p className="text-gw-small text-gw-secondary mb-2">
        {STATUS_ROLLUP_COPY.scopeNote}
      </p>
      {statuses.length === 0 ? (
        <p className="text-gw-small text-gw-secondary mb-2">
          {STATUS_ROLLUP_COPY.noStatusesConfigured}
        </p>
      ) : null}
      {hasTextResources ? (
        <table className="w-full text-left text-gw-small">
          <caption className="sr-only">
            {STATUS_ROLLUP_COPY.tableCaption}
          </caption>
          <thead>
            <tr className="font-mono text-gw-nano tracking-label uppercase text-gw-secondary">
              <th scope="col" className="py-1 pr-4 font-normal">
                {STATUS_ROLLUP_COPY.statusHeader}
              </th>
              <th scope="col" className="py-1 pr-4 font-normal text-right">
                {STATUS_ROLLUP_COPY.resourcesHeader}
              </th>
              <th scope="col" className="py-1 font-normal text-right">
                {STATUS_ROLLUP_COPY.wordsHeader}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.kind}:${row.label}`}
                className="border-t-hairline border-gw-border"
              >
                <th scope="row" className="py-1 pr-4 font-normal">
                  {row.label}
                </th>
                <td className="py-1 pr-4 text-right">{row.resourceCount}</td>
                <td className="py-1 text-right">{row.words}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-gw-small text-gw-secondary">
          {STATUS_ROLLUP_COPY.noResources}
        </p>
      )}
      <p className="text-gw-small text-gw-secondary mt-2">
        {STATUS_ROLLUP_COPY.staleNote}
      </p>
    </div>
  );
}
