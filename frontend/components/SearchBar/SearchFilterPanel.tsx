"use client";

import React from "react";
import { SlidersHorizontal } from "lucide-react";
import type { Folder, Tag } from "../../src/lib/models/types";
import type { SearchFilters } from "../../src/store/search-transport-service";
import Chip from "../common/UI/Chip";
import { Popover, PopoverContent, PopoverTrigger } from "../common/UI/Popover";
import FolderTreePicker from "../ResourceTree/FolderTreePicker";

export interface SearchFilterPanelProps {
  folders: Folder[];
  statuses: string[];
  tags: Tag[];
  activeFilters: SearchFilters;
  onFilterChange: (filters: SearchFilters) => void;
  disabled?: boolean;
}

export default function SearchFilterPanel({
  folders,
  statuses,
  tags,
  activeFilters,
  onFilterChange,
  disabled = false,
}: SearchFilterPanelProps): JSX.Element {
  const hasActiveFilters =
    !!activeFilters.folder ||
    !!activeFilters.status ||
    (activeFilters.tags?.length ?? 0) > 0;

  function setFolder(folderId: string | undefined): void {
    onFilterChange({ ...activeFilters, folder: folderId || undefined });
  }

  function toggleStatus(status: string): void {
    onFilterChange({
      ...activeFilters,
      status: activeFilters.status === status ? undefined : status,
    });
  }

  function toggleTag(tagId: string): void {
    const current = activeFilters.tags ?? [];
    const next = current.includes(tagId)
      ? current.filter((t) => t !== tagId)
      : [...current, tagId];
    onFilterChange({
      ...activeFilters,
      tags: next.length > 0 ? next : undefined,
    });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`searchbar-filter-toggle${hasActiveFilters ? " searchbar-filter-toggle-active" : ""}`}
          aria-label="Toggle search filters"
          disabled={disabled}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="searchbar-filter-panel w-72"
        align="end"
        sideOffset={6}
        role="region"
        aria-label="Search filters"
      >
        {folders.length > 0 && (
          <div className="searchbar-filter-section">
            <span className="searchbar-filter-label">Folder</span>
            <FolderTreePicker
              folders={folders}
              value={activeFilters.folder}
              onChange={setFolder}
              rootLabel="All folders"
              aria-label="Filter by folder"
            />
          </div>
        )}

        {statuses.length > 0 && (
          <div className="searchbar-filter-section">
            <span className="searchbar-filter-label">Status</span>
            <div className="flex flex-wrap gap-1">
              {statuses.map((status) => (
                <Chip
                  key={status}
                  label={status}
                  shape="rounded"
                  size="md"
                  active={activeFilters.status === status}
                  onClick={() => toggleStatus(status)}
                />
              ))}
            </div>
          </div>
        )}

        {tags.length > 0 && (
          <div className="searchbar-filter-section">
            <span className="searchbar-filter-label">Tags</span>
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => {
                const isActive = (activeFilters.tags ?? []).includes(tag.id);
                return (
                  <Chip
                    key={tag.id}
                    label={tag.name}
                    shape="rounded"
                    size="md"
                    active={isActive}
                    onClick={() => toggleTag(tag.id)}
                  />
                );
              })}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
