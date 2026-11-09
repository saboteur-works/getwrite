"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { PenLine, Search } from "lucide-react";
import type { AnyResource } from "../../src/lib/models/types";
import { Dialog, DialogContent, DialogTitle } from "./UI/Dialog";
import Input from "./UI/Input/Input";
import Listbox from "./UI/Listbox/Listbox";
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
}

/** A palette row: the Capture action or an openable resource. */
type PaletteRow =
  | { kind: "capture" }
  | { kind: "resource"; resource: AnyResource };

const CAPTURE_ROW_LABEL = "Capture...";
const CAPTURE_ROW_VALUE = "palette-action:capture";

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
}: ResourceCommandPaletteProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState<string>("");
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

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
    return onCapture && matchesCaptureRow(normalizedQuery)
      ? [{ kind: "capture" }, ...resourceRows]
      : resourceRows;
  }, [openableResources, query, onCapture]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setQuery("");
    setHighlightedIndex(0);
  }, [isOpen]);

  useEffect(() => {
    if (highlightedIndex <= rows.length - 1) {
      return;
    }

    setHighlightedIndex(Math.max(rows.length - 1, 0));
  }, [rows, highlightedIndex]);

  const handleSelectRow = (row: PaletteRow | undefined): void => {
    if (!row) return;
    if (row.kind === "capture") {
      onCapture?.();
    } else {
      onSelectResource(row.resource.id);
    }
    onClose();
  };

  const handleSelectValue = (value: string): void => {
    handleSelectRow(
      rows.find((row) =>
        row.kind === "capture"
          ? value === CAPTURE_ROW_VALUE
          : row.resource.id === value,
      ),
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
            options={rows.map((row) =>
              row.kind === "capture"
                ? {
                    value: CAPTURE_ROW_VALUE,
                    label: CAPTURE_ROW_LABEL,
                    icon: <PenLine size={16} aria-hidden="true" />,
                    meta: "Action",
                  }
                : {
                    value: row.resource.id,
                    label: getResourceName(row.resource),
                    icon: getResourceTypeIcon(row.resource),
                    meta: getResourceTypeLabel(row.resource),
                  },
            )}
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
