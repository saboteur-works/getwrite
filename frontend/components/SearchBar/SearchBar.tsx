import React, { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import useAppSelector, { useAppDispatch } from "../../src/store/hooks";
import { setSelectedResourceId } from "../../src/store/resourcesSlice";
import { selectSelectedProjectId } from "../../src/store/projectsSlice";
import {
    clearSearch,
    runSearch,
    selectSearchResults,
} from "../../src/store/searchSlice";

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
    const [query, setQuery] = useState<string>("");
    const [open, setOpen] = useState<boolean>(false);
    const [highlight, setHighlight] = useState<number>(0);
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
        if (query.length < 2 || !selectedProjectId) {
            dispatch(clearSearch());
            setOpen(false);
            return;
        }

        setOpen(true);
        const timerId = setTimeout(() => {
            dispatch(runSearch({ projectId: selectedProjectId, query }));
        }, 200);

        return () => clearTimeout(timerId);
    }, [query, selectedProjectId, dispatch]);

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

    return (
        <div className="searchbar-root" ref={containerRef}>
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
                    onFocus={() => setOpen(query.length >= 2 && results.length > 0)}
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

            {open && results.length > 0 ? (
                <ul className="searchbar-results">
                    {results.slice(0, 8).map((result, i) => (
                        <li key={result.resourceId} className="searchbar-result-item">
                            <button
                                type="button"
                                onClick={() => {
                                    dispatch(setSelectedResourceId(result.resourceId));
                                    onSelect?.(result.resourceId);
                                    setOpen(false);
                                    setQuery("");
                                }}
                                className={`searchbar-result-button ${
                                    i === highlight
                                        ? "searchbar-result-button-active"
                                        : ""
                                }`}
                            >
                                <span className="font-semibold">{result.title}</span>
                                {result.snippet ? (
                                    <span className="searchbar-result-snippet">
                                        {result.snippet}
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
