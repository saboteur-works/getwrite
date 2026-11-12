import React from "react";
import Button from "../../../common/UI/Button";
import type { SourceProblem } from "./useOrganizerSourceData";

/**
 * @module OrganizerStateMessage
 * The text shown in place of cards when the source cannot show any (Feature
 * 109, FR-3, FR-9): a source problem (loading, failed with Retry, deleted,
 * missing folder), an empty source, or filters that match nothing. Shared by
 * the default arrangement and the grid so both say the same thing.
 */

export interface OrganizerStateInput {
  sourceProblem: SourceProblem | null;
  isSmartSource: boolean;
  /** The source holds no cards before filtering. */
  isSourceEmpty: boolean;
  isAnyFilterActive: boolean;
  visibleCount: number;
}

/** The message node for the state, or `null` when there are cards to show. */
export function organizerStateMessage(
  input: OrganizerStateInput,
): React.ReactNode {
  const { sourceProblem } = input;
  if (sourceProblem) {
    return (
      <div
        role={sourceProblem.kind === "failed" ? "alert" : "status"}
        className="text-sm text-gw-secondary flex items-center gap-3"
      >
        <p>{sourceProblem.message}</p>
        {sourceProblem.retry && (
          <Button variant="secondary" onClick={sourceProblem.retry}>
            Retry
          </Button>
        )}
      </div>
    );
  }
  if (input.isSourceEmpty) {
    return (
      <p className="text-sm text-gw-secondary">
        {input.isSmartSource
          ? "No documents match this smart folder."
          : "This folder is empty."}
      </p>
    );
  }
  if (input.isAnyFilterActive && input.visibleCount === 0) {
    return (
      <p className="text-sm text-gw-secondary">
        No cards match the current filters.
      </p>
    );
  }
  return null;
}

/** The alert for a failed card-excerpt read. */
export function OrganizerExcerptsFailedNotice({
  message,
}: {
  message: string;
}): JSX.Element {
  return (
    <p role="alert" className="text-sm text-gw-secondary mb-3">
      Card excerpts could not be loaded: {message}
    </p>
  );
}
