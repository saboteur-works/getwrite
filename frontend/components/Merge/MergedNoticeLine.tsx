import React from "react";
import { MERGED_NOTICE_LINE } from "../../src/lib/models/merge-messages";
import type { AnyResource } from "../../src/lib/models/types";
import { useAppSelector } from "../../src/store/hooks";
import type { RootState } from "../../src/store/store";
import { isMergedDocument } from "../../src/lib/models/split-eligibility";
import { useMergedMarkViews, type MergedMarkView } from "./useMergedMarkState";

export interface MergedNoticeLineProps {
  /** What the mark says now: the state and its label from `merge-messages.ts`. */
  view: MergedMarkView;
}

/**
 * The notice at the top of an open merged document (Feature 121, FR-16): the
 * mark's state in words, then the rule of FR-17 to FR-20. Always visible text,
 * never only on hover, and a tab stop so a keyboard user can land on it and a
 * screen reader reads it as a note. The editor below stays editable and no
 * control here clears the mark; the rule text stays whatever the state is.
 */
export default function MergedNoticeLine({
  view,
}: MergedNoticeLineProps): JSX.Element {
  return (
    <div
      role="note"
      aria-label="This document was merged"
      // A tab stop on purpose: the notice must be reachable by keyboard (FR-16, FR-23).
      tabIndex={0}
      data-testid="merged-notice-line"
      data-state={view.state}
      className="shrink-0 border-b border-gw-border bg-gw-chrome px-4 py-2 text-sm text-gw-primary"
    >
      <p className="font-semibold">{view.label}</p>
      <p>{MERGED_NOTICE_LINE}</p>
    </div>
  );
}

function ResolvedNotice({ resource }: { resource: AnyResource }): JSX.Element {
  const views = useMergedMarkViews([
    {
      id: resource.id,
      mark: (resource as unknown as Record<string, unknown>)["mergedMark"],
    },
  ]);
  const view = views.get(resource.id);
  return view ? <MergedNoticeLine view={view} /> : <></>;
}

/**
 * The notice for the document with this id, or nothing when it is not a merged
 * document. Reads the mark from the store's resource, so it follows the
 * document the editor shows.
 */
export function MergedNoticeForResource({
  resourceId,
}: {
  resourceId: string;
}): JSX.Element | null {
  const resource = useAppSelector((s: RootState) =>
    s.resources?.resources.find((r) => r.id === resourceId),
  );
  if (
    !resource ||
    !isMergedDocument(resource as unknown as Record<string, unknown>)
  )
    return null;
  return <ResolvedNotice resource={resource} />;
}
