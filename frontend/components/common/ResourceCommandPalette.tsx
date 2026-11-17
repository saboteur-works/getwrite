"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { PenLine, Scissors, Search, Undo2 } from "lucide-react";
import type { AnyResource } from "../../src/lib/models/types";
import { Dialog, DialogContent, DialogTitle } from "./UI/Dialog";
import Input from "./UI/Input/Input";
import Listbox from "./UI/Listbox/Listbox";
import { openSplitDialog } from "../Split/splitOpenRequest";
import {
  requestSplitUndo,
  requestSplitUndoRefresh,
  useSplitUndoAvailability,
} from "../Split/splitUndoRequest";
import { resolveSplitOffName } from "../Split/splitUndoName";
import {
  describeUndoSplitAction,
  UNDO_SPLIT_LABEL,
} from "../../src/lib/models/split-messages";
import { splitEligibility } from "../../src/lib/models/split-eligibility";
import { SPLIT_REFUSAL_REASONS } from "../../src/lib/models/split-types";
import { SPLIT_REFUSAL_MESSAGES } from "../../src/lib/models/split-messages";
import {
  AudioIcon,
  FileTextIcon,
  ImageIcon,
} from "../ResourceTree/ResourceTreeIcons";

interface ResourceCommandPaletteProps {
  isOpen: boolean;
  resources: AnyResource[];
  onClose: () => void;
  onSelectResource: (resourceId: string) => void;
  /**
   * Opens the Capture box (Feature 106, FR-24). When given, a "Capture..." row
   * leads the list for an empty query or a prefix of "capture"; the palette
   * closes itself after calling it. Without it the row is not shown.
   */
  onCapture?: () => void;
  /**
   * The id of the document open in the editor (Feature 120, FR-13). When it
   * names a resource in `resources`, a "Split at cursor" row follows the
   * Capture row: it asks the split host to open the dialog, or, for a
   * document the split rules refuse by type, is disabled and states why.
   * Absent, null or unknown: no row. Never shown on the native runtime.
   */
  openResourceId?: string | null;
}

/** A palette row: an action (Capture, Split) or an openable resource. */
type PaletteRow =
  | { kind: "capture" }
  | { kind: "split"; refusal: string | null }
  | { kind: "undo-split"; description: string; isDisabled: boolean }
  | { kind: "resource"; resource: AnyResource };

const CAPTURE_ROW_LABEL = "Capture...";
const CAPTURE_ROW_VALUE = "palette-action:capture";
const SPLIT_ROW_LABEL = "Split at cursor";
const SPLIT_ROW_VALUE = "palette-action:split";
const UNDO_SPLIT_ROW_VALUE = "palette-action:undo-split";

/** True for an empty query or a case-insensitive prefix of the Split label. */
function matchesSplitRow(normalizedQuery: string): boolean {
  return SPLIT_ROW_LABEL.toLowerCase().startsWith(normalizedQuery);
}

/** True for an empty query or a case-insensitive prefix of the Undo split label. */
function matchesUndoSplitRow(normalizedQuery: string): boolean {
  return UNDO_SPLIT_LABEL.toLowerCase().startsWith(normalizedQuery);
}

/**
 * The stated reason the open resource cannot be split because of what it is
 * (image, audio, folder, Source, entity, merged), or null. Uses the pure
 * decision of FR-2 with no document: the one answer that is not a kind
 * refusal is `stale-cursor` (no document given), which here means "not
 * refused by type"; the cursor and halves are the host's to judge.
 */
function splitRefusalByType(resource: AnyResource): string | null {
  const result = splitEligibility({
    document: null,
    sidecar: resource as unknown as Record<string, unknown>,
    offset: 0,
  });
  if (result.eligible || result.reason === SPLIT_REFUSAL_REASONS.staleCursor) {
    return null;
  }
  return SPLIT_REFUSAL_MESSAGES[result.reason];
}

/** True for an empty query or a case-insensitive prefix of "capture". */
function matchesCaptureRow(normalizedQuery: string): boolean {
  return "capture".startsWith(normalizedQuery);
}

function getResourceName(resource: AnyResource): string {
  return resource.name.trim().length > 0 ? resource.name : resource.id;
}

function getResourceTypeLabel(resource: AnyResource): string {
  if (resource.type === "image") {
    return "Image";
  }

  if (resource.type === "audio") {
    return "Audio";
  }

  return "Text";
}

/** The resource tree's icon for the resource's type (decorative). */
function getResourceTypeIcon(resource: AnyResource): React.ReactNode {
  if (resource.type === "image") return <ImageIcon />;
  if (resource.type === "audio") return <AudioIcon />;
  return <FileTextIcon />;
}

export default function ResourceCommandPalette({
  isOpen,
  resources,
  onClose,
  onSelectResource,
  onCapture,
  openResourceId,
}: ResourceCommandPaletteProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState<string>("");
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const undoAvailability = useSplitUndoAvailability();

  const openableResources = useMemo(() => {
    return resources.filter((resource) => resource.type !== "folder");
  }, [resources]);

  const rows = useMemo((): PaletteRow[] => {
    const normalizedQuery = query.trim().toLowerCase();
    const matching =
      normalizedQuery.length === 0
        ? openableResources
        : openableResources.filter((resource) => {
            const name = getResourceName(resource).toLowerCase();
            return name.includes(normalizedQuery);
          });
    const resourceRows: PaletteRow[] = matching
      .slice(0, 50)
      .map((resource) => ({ kind: "resource", resource }));
    const openResource =
      openResourceId && process.env.NEXT_PUBLIC_GETWRITE_RUNTIME !== "native"
        ? resources.find((candidate) => candidate.id === openResourceId)
        : undefined;
    const actionRows: PaletteRow[] = [];
    if (onCapture && matchesCaptureRow(normalizedQuery)) {
      actionRows.push({ kind: "capture" });
    }
    if (openResource && matchesSplitRow(normalizedQuery)) {
      actionRows.push({
        kind: "split",
        refusal: splitRefusalByType(openResource),
      });
    }
    // Undo split is offered in any open document (Feature 120, FR-18), while
    // the latest-operation read shows a split; a failed read is its own row.
    if (
      process.env.NEXT_PUBLIC_GETWRITE_RUNTIME !== "native" &&
      matchesUndoSplitRow(normalizedQuery)
    ) {
      if (undoAvailability.kind === "split") {
        actionRows.push({
          kind: "undo-split",
          isDisabled: false,
          description: describeUndoSplitAction(
            resolveSplitOffName(resources, undoAvailability.splitOffDocumentId),
          ),
        });
      } else if (undoAvailability.kind === "read-failed") {
        actionRows.push({
          kind: "undo-split",
          isDisabled: true,
          description: undoAvailability.message,
        });
      }
    }
    return [...actionRows, ...resourceRows];
  }, [
    openableResources,
    resources,
    query,
    onCapture,
    openResourceId,
    undoAvailability,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setQuery("");
    setHighlightedIndex(0);
    // The latest operation is read from the stored record each time the
    // palette opens, so the row survives a reload (Feature 120, FR-18).
    requestSplitUndoRefresh();
  }, [isOpen]);

  useEffect(() => {
    if (highlightedIndex <= rows.length - 1) {
      return;
    }

    setHighlightedIndex(Math.max(rows.length - 1, 0));
  }, [rows, highlightedIndex]);

  const handleSelectRow = (row: PaletteRow | undefined): void => {
    if (!row) return;
    if (row.kind === "split") {
      // A disabled row does nothing and keeps the palette open, so its
      // stated reason stays on screen.
      if (row.refusal !== null) return;
      onClose();
      openSplitDialog();
      return;
    }
    if (row.kind === "undo-split") {
      if (row.isDisabled) return;
      onClose();
      requestSplitUndo();
      return;
    }
    if (row.kind === "capture") {
      onCapture?.();
    } else {
      onSelectResource(row.resource.id);
    }
    onClose();
  };

  const handleSelectValue = (value: string): void => {
    handleSelectRow(
      rows.find((row) => {
        if (row.kind === "capture") return value === CAPTURE_ROW_VALUE;
        if (row.kind === "split") return value === SPLIT_ROW_VALUE;
        if (row.kind === "undo-split") return value === UNDO_SPLIT_ROW_VALUE;
        return row.resource.id === value;
      }),
    );
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((previous) => {
        return Math.min(previous + 1, Math.max(rows.length - 1, 0));
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((previous) => Math.max(previous - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      handleSelectRow(rows[highlightedIndex]);
      return;
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        topAlign
        maxWidth="max-w-[560px]"
        className="p-0 overflow-hidden"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">Open Resource</DialogTitle>

        <div className="resource-palette-header">
          <div className="resource-palette-title">
            <Search size={16} aria-hidden="true" />
            <span>Open Resource</span>
          </div>
          <span className="resource-palette-hint">
            {rows[highlightedIndex]?.kind === "capture"
              ? "Enter to open Capture box"
              : rows[highlightedIndex]?.kind === "split"
                ? "Enter to split at the cursor"
                : rows[highlightedIndex]?.kind === "undo-split"
                  ? "Enter to undo the split"
                  : "Enter to open"}
          </span>
        </div>

        <div className="resource-palette-input-row">
          <Search
            size={16}
            aria-hidden="true"
            className="resource-palette-input-icon"
          />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            className="resource-palette-input"
            placeholder="Search resources..."
          />
        </div>

        {rows.length > 0 ? (
          <Listbox
            options={rows.map((row) => {
              if (row.kind === "capture") {
                return {
                  value: CAPTURE_ROW_VALUE,
                  label: CAPTURE_ROW_LABEL,
                  icon: <PenLine size={16} aria-hidden="true" />,
                  meta: "Action",
                };
              }
              if (row.kind === "split") {
                return {
                  value: SPLIT_ROW_VALUE,
                  label: SPLIT_ROW_LABEL,
                  icon: <Scissors size={16} aria-hidden="true" />,
                  meta: row.refusal === null ? "Action" : "Unavailable",
                  description: row.refusal ?? undefined,
                  disabled: row.refusal !== null,
                };
              }
              if (row.kind === "undo-split") {
                return {
                  value: UNDO_SPLIT_ROW_VALUE,
                  label: UNDO_SPLIT_LABEL,
                  icon: <Undo2 size={16} aria-hidden="true" />,
                  meta: row.isDisabled ? "Unavailable" : "Action",
                  description: row.description,
                  disabled: row.isDisabled,
                };
              }
              return {
                value: row.resource.id,
                label: getResourceName(row.resource),
                icon: getResourceTypeIcon(row.resource),
                meta: getResourceTypeLabel(row.resource),
              };
            })}
            highlightedIndex={highlightedIndex}
            onSelect={handleSelectValue}
            onHighlightChange={setHighlightedIndex}
            anchored={false}
            aria-label="Resources"
            className="resource-palette-list"
          />
        ) : (
          /* Not an empty `<ul role="listbox">`: the message was an `<li>`
             whose parent was a listbox rather than a list, which axe flags,
             and an option-less listbox announces nothing useful anyway. As a
             `role="status"` it is read out when the search stops matching. */
          <div className="resource-palette-list">
            <p className="resource-palette-empty" role="status">
              No resources match your search.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
