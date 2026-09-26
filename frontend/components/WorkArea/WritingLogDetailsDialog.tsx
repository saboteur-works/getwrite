"use client";

import React from "react";
import Button from "../common/UI/Button/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "../common/UI/Dialog";
import {
  getTodayWritingLog,
  type WritingLogAggregate,
} from "../../src/lib/api/writing-log";
import {
  getWritingLogSessionIncomplete,
  subscribeWritingLogSessionIncomplete,
} from "../../src/lib/writing-log-signal";

export interface WritingLogDetailsDialogProps {
  /** Whether the overlay is open. Numbers are fetched each time it opens. */
  isOpen: boolean;
  /** On-disk project directory id. */
  projectId: string;
  /** Called when the overlay is dismissed (Esc, overlay click or Close). */
  onClose: () => void;
  /** Element that receives focus when the overlay closes (the opening button). */
  returnFocusRef: React.RefObject<HTMLElement | null>;
}

type DetailsState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; aggregate: WritingLogAggregate };

/**
 * Read-only "Today's writing" details overlay (Feature 59, FR-7/FR-8).
 * A blocking modal on `UI/Dialog`. Its figures are fetched once when it opens
 * and do not change while open; the goal is edited only in Project Settings.
 */
export default function WritingLogDetailsDialog({
  isOpen,
  projectId,
  onClose,
  returnFocusRef,
}: WritingLogDetailsDialogProps): JSX.Element {
  const [state, setState] = React.useState<DetailsState>({ kind: "loading" });
  const hasSessionIncomplete = React.useSyncExternalStore(
    subscribeWritingLogSessionIncomplete,
    getWritingLogSessionIncomplete,
    () => false,
  );

  React.useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;
    setState({ kind: "loading" });
    getTodayWritingLog(projectId)
      .then((aggregate) => {
        if (!isCancelled) setState({ kind: "ready", aggregate });
      })
      .catch(() => {
        if (!isCancelled) setState({ kind: "error" });
      });
    return () => {
      isCancelled = true;
    };
  }, [isOpen, projectId]);

  const aggregate = state.kind === "ready" ? state.aggregate : null;
  const isIncomplete = (aggregate?.incomplete ?? false) || hasSessionIncomplete;
  const description =
    aggregate === null
      ? "Today's writing details"
      : aggregate.goal === undefined
        ? "No daily goal set"
        : `Daily goal: ${aggregate.goal}`;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        maxWidth="max-w-[420px]"
        className="p-6"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <DialogTitle>Today&apos;s writing</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <div className="mt-4 flex flex-col gap-1 text-gw-small text-gw-primary">
          {state.kind === "loading" && <span>Loading…</span>}
          {state.kind === "error" && (
            <span>Today&apos;s count is unavailable</span>
          )}
          {aggregate && (
            <>
              <span>Added: {aggregate.totals.added}</span>
              <span>Deleted: {aggregate.totals.deleted}</span>
              <span>Net: {aggregate.totals.net}</span>
              <span>
                Imported (not counted toward goal): {aggregate.imported.net}
              </span>
            </>
          )}
          {isIncomplete && <span>Today&apos;s count may be incomplete</span>}
        </div>
        <p className="mt-3 text-gw-small text-gw-secondary">
          Set the daily goal in Project Settings.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
