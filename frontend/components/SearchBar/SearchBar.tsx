"use client";

import React, { useEffect, useRef, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import useAppSelector, { useAppDispatch } from "../../src/store/hooks";
import { setSelectedResourceId, selectFolders } from "../../src/store/resourcesSlice";
import {
    selectSelectedProjectId,
    selectActiveProjectStatuses,
} from "../../src/store/projectsSlice";
import {
    clearSearch,
    runSearch,
    selectSearchResults,
} from "../../src/store/searchSlice";
import type { SearchFilters } from "../../src/store/search-transport-service";
import type { Tag } from "../../src/lib/models/types";
import SearchFilterPanel from "./SearchFilterPanel";

function renderSnippet(snippet: string, query: string): React.ReactNode {
    if (!snippet || !query) return snippet;
    const terms = query.split(/\s+/).filter(Boolean);
    if (terms.length === 0) return snippet;
    const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`(${escaped.join("|")})`, "gi");
    const parts = snippet.split(regex);
    const lowerTerms = terms.map((t) => t.toLowerCase());
    return (
        <>
            {parts.map((part, i) =>
                lowerTerms.includes(part.toLowerCase()) ? (
                    <mark key={i} className="searchbar-result-match">
                        {part}
                    </mark>
                ) : (
                    part
                ),
            )}
        </>
    );
}

export interface SearchBarProps {
    placeholder?: string;
    onSelect?: (id: string) => void;
}

export default function SearchBar({
    placeholder = "Search resources...",
    onSelect,
}: SearchBarProps): JSX.Element {
    const [shortcutHint, setShortcutHint] = useState<string>("⌘K / Ctrl K");
    const dispatch = useAppDispatch();
    const selectedProjectId = useAppSelector(selectSelectedProjectId);
    const results = useAppSelector(selectSearchResults);
    const statuses = useAppSelector(selectActiveProjectStatuses);
    const folders = useAppSelector((s) => selectFolders(s.resources));
    const projectPath = useAppSelector((s) => {
        const id = s.projects.selectedProjectId;
        if (!id) return null;
        return s.projects.projects[id]?.rootPath ?? null;
    });

    const [query, setQuery] = useState<string>("");
    const [open, setOpen] = useState<boolean>(false);
    const [highlight, setHighlight] = useState<number>(0);
    const [filterPanelOpen, setFilterPanelOpen] = useState<boolean>(false);
    const [activeFilters, setActiveFilters] = useState<SearchFilters>({});
    const [availableTags, setAvailableTags] = useState<Tag[]>([]);

    const inputRef = useRef<HTMLInputElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        function onDocClick(e: MouseEvent) {
            if (
                containerRef.current &&
                !containerRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, []);

    useEffect(() => setHighlight(0), [query]);

    useEffect(() => {
        const platform =
            typeof navigator === "undefined" ? "" : navigator.platform;
        const userAgent =
            typeof navigator === "undefined" ? "" : navigator.userAgent;
        const isMacPlatform = /mac/i.test(`${platform} ${userAgent}`);
        setShortcutHint(isMacPlatform ? "⌘K" : "Ctrl K");
    }, []);

    useEffect(() => {
        if (!selectedProjectId) return;
        void fetch(`/api/project/${selectedProjectId}/reindex`, {
            method: "POST",
        });
    }, [selectedProjectId]);

    useEffect(() => {
        if (!projectPath) {
            setAvailableTags([]);
            return;
        }
        fetch("/api/project/tags", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "list", projectPath }),
        })
            .then((r) => r.json())
            .then((data: { tags?: Tag[] }) => setAvailableTags(data.tags ?? []))
            .catch(() => setAvailableTags([]));
    }, [projectPath]);

    useEffect(() => {
        if (query.length < 2 || !selectedProjectId) {
            dispatch(clearSearch());
            setOpen(false);
            return;
        }

        setOpen(true);
        const timerId = setTimeout(() => {
            dispatch(
                runSearch({
                    projectId: selectedProjectId,
                    query,
                    filters: activeFilters,
                }),
            );
        }, 200);

        return () => clearTimeout(timerId);
    }, [query, selectedProjectId, activeFilters, dispatch]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!open) return;
        if (e.key === "ArrowDown") {
            setHighlight((h) => Math.min(h + 1, results.length - 1));
            e.preventDefault();
        } else if (e.key === "ArrowUp") {
            setHighlight((h) => Math.max(h - 1, 0));
            e.preventDefault();
        } else if (e.key === "Enter") {
            const r = results[highlight];
            if (r) {
                dispatch(setSelectedResourceId(r.resourceId));
                onSelect?.(r.resourceId);
                setOpen(false);
                setQuery("");
            }
            e.preventDefault();
        } else if (e.key === "Escape") {
            setOpen(false);
            e.preventDefault();
        }
    };

    const hasActiveFilters =
        !!activeFilters.folder ||
        !!activeFilters.status ||
        (activeFilters.tags?.length ?? 0) > 0;

    return (
        <div className="searchbar-root" ref={containerRef}>
            <div className="searchbar-input-row">
                <div className="searchbar-field">
                    <Search
                        size={16}
                        aria-hidden="true"
                        className="searchbar-icon"
                    />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() =>
                            setOpen(query.length >= 2 && results.length > 0)
                        }
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        aria-label="resource-search"
                        className="searchbar-input"
                        disabled={!selectedProjectId}
                    />
                    <span className="searchbar-shortcut" aria-hidden="true">
                        {shortcutHint}
                    </span>
                </div>
                <button
                    type="button"
                    className={`searchbar-filter-toggle${
                        filterPanelOpen || hasActiveFilters
                            ? " searchbar-filter-toggle-active"
                            : ""
                    }`}
                    onClick={() => setFilterPanelOpen((v) => !v)}
                    aria-label="Toggle search filters"
                    aria-expanded={filterPanelOpen}
                    disabled={!selectedProjectId}
                >
                    <SlidersHorizontal size={14} aria-hidden="true" />
                </button>
            </div>

            {filterPanelOpen && (
                <SearchFilterPanel
                    folders={folders}
                    statuses={statuses}
                    tags={availableTags}
                    activeFilters={activeFilters}
                    onFilterChange={setActiveFilters}
                />
            )}

            {open && results.length > 0 ? (
                <ul className="searchbar-results">
                    {results.slice(0, 8).map((result, i) => (
                        <li
                            key={result.resourceId}
                            className="searchbar-result-item"
                        >
                            <button
                                type="button"
                                onClick={() => {
                                    dispatch(
                                        setSelectedResourceId(result.resourceId),
                                    );
                                    onSelect?.(result.resourceId);
                                    setOpen(false);
                                    setQuery("");
                                }}
                                className={`searchbar-result-button${
                                    i === highlight
                                        ? " searchbar-result-button-active"
                                        : ""
                                }`}
                            >
                                <span className="font-semibold">
                                    {result.title}
                                </span>
                                {result.snippet ? (
                                    <span className="searchbar-result-snippet">
                                        {renderSnippet(result.snippet, query)}
                                    </span>
                                ) : null}
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
