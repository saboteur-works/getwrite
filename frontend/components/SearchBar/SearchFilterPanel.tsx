"use client";

import React from "react";
import type { Folder, Tag } from "../../src/lib/models/types";
import type { SearchFilters } from "../../src/store/search-transport-service";

export interface SearchFilterPanelProps {
    folders: Folder[];
    statuses: string[];
    tags: Tag[];
    activeFilters: SearchFilters;
    onFilterChange: (filters: SearchFilters) => void;
}

export default function SearchFilterPanel({
    folders,
    statuses,
    tags,
    activeFilters,
    onFilterChange,
}: SearchFilterPanelProps): JSX.Element {
    function setFolder(folderId: string): void {
        onFilterChange({
            ...activeFilters,
            folder: folderId || undefined,
        });
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
        <div className="searchbar-filter-panel" role="region" aria-label="Search filters">
            {folders.length > 0 && (
                <div className="searchbar-filter-section">
                    <span className="searchbar-filter-label">Folder</span>
                    <select
                        className="searchbar-filter-select"
                        value={activeFilters.folder ?? ""}
                        onChange={(e) => setFolder(e.target.value)}
                        aria-label="Filter by folder"
                    >
                        <option value="">All folders</option>
                        {folders.map((folder) => (
                            <option key={folder.id} value={folder.id}>
                                {folder.name}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {statuses.length > 0 && (
                <div className="searchbar-filter-section">
                    <span className="searchbar-filter-label">Status</span>
                    <div className="searchbar-chips">
                        {statuses.map((status) => (
                            <button
                                key={status}
                                type="button"
                                className={`searchbar-chip${
                                    activeFilters.status === status
                                        ? " searchbar-chip-active"
                                        : ""
                                }`}
                                onClick={() => toggleStatus(status)}
                                aria-pressed={activeFilters.status === status}
                            >
                                {status}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {tags.length > 0 && (
                <div className="searchbar-filter-section">
                    <span className="searchbar-filter-label">Tags</span>
                    <div className="searchbar-chips">
                        {tags.map((tag) => {
                            const isActive = (activeFilters.tags ?? []).includes(
                                tag.id,
                            );
                            return (
                                <button
                                    key={tag.id}
                                    type="button"
                                    className={`searchbar-chip${isActive ? " searchbar-chip-active" : ""}`}
                                    onClick={() => toggleTag(tag.id)}
                                    aria-pressed={isActive}
                                >
                                    {tag.name}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
