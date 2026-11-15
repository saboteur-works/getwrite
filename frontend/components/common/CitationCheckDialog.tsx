"use client";

import React from "react";
import Button from "./UI/Button/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "./UI/Dialog";
import {
  UNNAMED_SOURCE_NAME,
  type CitationCheckResult,
  type CitationGap,
} from "../../src/lib/models/citations-types";

/**
 * Feature 116 (FR-15, FR-23): the pre-run warning shown before a compile with
 * citations on. Presentational: the check result comes in by props, and
 * Proceed and Cancel are callbacks. A failed check offers Cancel only.
 */
export interface CitationCheckDialogProps {
  isOpen: boolean;
  result: CitationCheckResult;
  onProceed: () => void;
  onCancel: () => void;
}

interface SourceGroup {
  sourceId: string;
  name: string;
  gaps: CitationGap[];
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Groups gaps by Source, each Source once, in first-seen order. */
function groupBySource(gaps: readonly CitationGap[]): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  for (const gap of gaps) {
    const existing = groups.get(gap.sourceId);
    if (existing) {
      existing.gaps.push(gap);
      if (existing.name === UNNAMED_SOURCE_NAME && gap.sourceName) {
        existing.name = gap.sourceName;
      }
    } else {
      groups.set(gap.sourceId, {
        sourceId: gap.sourceId,
        name: gap.sourceName ? gap.sourceName : UNNAMED_SOURCE_NAME,
        gaps: [gap],
      });
    }
  }
  return [...groups.values()];
}

/** The state of one gap, as text. */
function describeGap(gap: CitationGap): string {
  switch (gap.kind) {
    case "source-removed":
      return "Removed: this Source is in Trash or deleted.";
    case "could-not-be-checked":
      return "Could not be checked: this Source could not be read.";
    case "missing-detail": {
      const details = gap.missingDetails ?? [];
      return details.length > 0
        ? `Incomplete: missing ${details.join(", ")}.`
        : "Incomplete: the style needs more details.";
    }
  }
}

function SourceItem({ group }: { group: SourceGroup }): JSX.Element {
  const distinctStates = [...new Set(group.gaps.map(describeGap))];
  return (
    <li className="border-gw-border border-b-[0.05rem] py-2 text-sm">
      <span className="font-semibold text-gw-primary">{group.name}</span>
      <span className="text-gw-secondary">
        {" "}
        ({plural(group.gaps.length, "citation", "citations")})
      </span>
      {distinctStates.map((state) => (
        <p key={state} className="text-gw-secondary">
          {state}
        </p>
      ))}
    </li>
  );
}

export default function CitationCheckDialog({
  isOpen,
  result,
  onProceed,
  onCancel,
}: CitationCheckDialogProps): JSX.Element {
  const isFailed = result.status === "failed";
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent maxWidth="max-w-[560px]" className="p-6">
        <DialogTitle>Check citations before compiling</DialogTitle>
        {result.status === "failed" ? (
          <>
            <DialogDescription className="sr-only">
              The citation check did not finish.
            </DialogDescription>
            <p role="alert" className="text-sm text-gw-primary">
              {result.message}
            </p>
          </>
        ) : (
          <>
            <DialogDescription>
              {`${plural(result.citationCount, "citation", "citations")}, ${plural(
                result.incompleteSourceCount,
                "Source",
                "Sources",
              )} incomplete`}
            </DialogDescription>
            <ul
              aria-label="Sources with incomplete citations"
              className="mt-3 list-none p-0"
            >
              {groupBySource(result.gaps).map((group) => (
                <SourceItem key={group.sourceId} group={group} />
              ))}
            </ul>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          {isFailed ? null : (
            <Button variant="default" onClick={onProceed}>
              Proceed
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
