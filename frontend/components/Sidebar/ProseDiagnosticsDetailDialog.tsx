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
  getProseDiagnosticsDetail,
  type LocatedRepeatedWordResult,
} from "../../src/lib/api/prose-diagnostics";

// ---------------------------------------------------------------------------
// Working-copy strings (Feature 62, Task 7). Not yet confirmed with the
// product owner, mirroring how Task 6's `ProseDiagnosticsSection.tsx`
// flagged its own unconfirmed copy. Tests are written against these literal
// strings.
// ---------------------------------------------------------------------------
const TITLE = "Repeated words";
const DESCRIPTION = "Where each repeated word occurs in this resource.";
const LOADING_MESSAGE = "Loading located repeated words…";
const ERROR_MESSAGE = "Couldn't load repeated-word detail. Try again later.";
const NO_RESULTS_MESSAGE = "No repeated words found.";
const POSITIONS_LABEL = "Positions";
const CLOSE_LABEL = "Close";

export interface ProseDiagnosticsDetailDialogProps {
  /** Whether the overlay is open. Detail is fetched each time it opens. */
  isOpen: boolean;
  /** On-disk project directory id. */
  projectId: string;
  /** The resource whose located repeated-word detail is being shown. */
  resourceId: string;
  /** Called when the overlay is dismissed (Esc, overlay click or Close). */
  onClose: () => void;
  /** Element that receives focus when the overlay closes (the opening button). */
  returnFocusRef: React.RefObject<HTMLElement | null>;
}

type DetailState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; results: LocatedRepeatedWordResult[] };

/**
 * Read-only located repeated-word detail overlay (Feature 62, FR-1/FR-5). A
 * blocking modal on `UI/Dialog`, mirroring `WritingLogDetailsDialog.tsx`'s
 * structure exactly: a discriminated `loading | error | ready` state fetched
 * fresh on every open (never cached across opens), and a `returnFocusRef`
 * that receives focus back when the overlay closes.
 */
export default function ProseDiagnosticsDetailDialog({
  isOpen,
  projectId,
  resourceId,
  onClose,
  returnFocusRef,
}: ProseDiagnosticsDetailDialogProps): JSX.Element {
  const [state, setState] = React.useState<DetailState>({ kind: "loading" });

  React.useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;
    setState({ kind: "loading" });
    getProseDiagnosticsDetail(projectId, resourceId)
      .then((results) => {
        if (!isCancelled) setState({ kind: "ready", results });
      })
      .catch(() => {
        if (!isCancelled) setState({ kind: "error" });
      });
    return () => {
      isCancelled = true;
    };
  }, [isOpen, projectId, resourceId]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        maxWidth="max-w-[480px]"
        className="p-6"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <DialogTitle>{TITLE}</DialogTitle>
        <DialogDescription>{DESCRIPTION}</DialogDescription>
        <div className="mt-4 flex flex-col gap-2 text-gw-small text-gw-primary">
          {state.kind === "loading" && (
            <span role="status">{LOADING_MESSAGE}</span>
          )}
          {state.kind === "error" && <span role="alert">{ERROR_MESSAGE}</span>}
          {state.kind === "ready" && state.results.length === 0 && (
            <span>{NO_RESULTS_MESSAGE}</span>
          )}
          {state.kind === "ready" && state.results.length > 0 && (
            <ul className="flex flex-col gap-2">
              {state.results.map((result) => (
                <li key={result.word}>
                  <span className="text-gw-primary">
                    {result.word} ({result.count})
                  </span>
                  <span className="block text-gw-secondary">
                    {POSITIONS_LABEL}: {result.offsets.join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {CLOSE_LABEL}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
