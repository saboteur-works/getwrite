"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Image as ImageIcon, Music2, Search } from "lucide-react";
import type { AnyResource } from "../../src/lib/models/types";
import { Dialog, DialogContent, DialogTitle } from "./UI/Dialog";
import Input from "./UI/Input/Input";
import Listbox from "./UI/Listbox/Listbox";
import type { ListboxOption } from "./UI/Listbox/Listbox";

interface ResourceCommandPaletteProps {
  isOpen: boolean;
  resources: AnyResource[];
  onClose: () => void;
  onSelectResource: (resourceId: string) => void;
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

function ResourceTypeIcon({
  resource,
}: {
  resource: AnyResource;
}): JSX.Element {
  if (resource.type === "image") {
    return <ImageIcon size={16} aria-hidden="true" />;
  }

  if (resource.type === "audio") {
    return <Music2 size={16} aria-hidden="true" />;
  }

  return <FileText size={16} aria-hidden="true" />;
}

export default function ResourceCommandPalette({
  isOpen,
  resources,
  onClose,
  onSelectResource,
}: ResourceCommandPaletteProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState<string>("");
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const openableResources = useMemo(() => {
    return resources.filter((resource) => resource.type !== "folder");
  }, [resources]);

  const filteredResources = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length === 0) {
      return openableResources.slice(0, 50);
    }

    return openableResources
      .filter((resource) => {
        const name = getResourceName(resource).toLowerCase();
        return name.includes(normalizedQuery);
      })
      .slice(0, 50);
  }, [openableResources, query]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setQuery("");
    setHighlightedIndex(0);
  }, [isOpen]);

  useEffect(() => {
    if (highlightedIndex <= filteredResources.length - 1) {
      return;
    }

    setHighlightedIndex(Math.max(filteredResources.length - 1, 0));
  }, [filteredResources, highlightedIndex]);

  const handleSelect = (resourceId: string): void => {
    onSelectResource(resourceId);
    onClose();
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((previous) => {
        return Math.min(
          previous + 1,
          Math.max(filteredResources.length - 1, 0),
        );
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
      const highlightedResource = filteredResources[highlightedIndex];
      if (highlightedResource) {
        handleSelect(highlightedResource.id);
      }
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
          <span className="resource-palette-hint">Enter to open</span>
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

        {filteredResources.length > 0 ? (
          <Listbox
            options={filteredResources.map((r) => ({
              value: r.id,
              label: getResourceName(r),
              meta: getResourceTypeLabel(r),
            }))}
            highlightedIndex={highlightedIndex}
            onSelect={handleSelect}
            onHighlightChange={setHighlightedIndex}
            anchored={false}
            aria-label="Resources"
            className="resource-palette-list"
          />
        ) : (
          <ul
            className="resource-palette-list"
            role="listbox"
            aria-label="Resources"
          >
            <li className="resource-palette-empty">
              No resources match your search.
            </li>
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
