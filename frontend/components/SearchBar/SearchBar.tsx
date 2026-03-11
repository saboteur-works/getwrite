import React, { useEffect, useRef, useState } from "react";
import type { AnyResource } from "../../src/lib/models/types";
import useAppSelector from "../../src/store/hooks";
import { selectResources } from "../../src/store/resourcesSlice";

/**
 * @module SearchBar
 * Provides a searchable resource input with lightweight fuzzy matching,
 * keyboard navigation, and result highlighting.
 */

/**
 * Props accepted by {@link SearchBar}.
 */
export interface SearchBarProps {
    /**
     * Optional resource list override.
     *
    /** Placeholder text shown in the search input when empty. */
    placeholder?: string;
    /**
     * Callback fired when a search result is selected.
     *
     * @param id - The selected resource identifier.
     */
    onSelect?: (id: string) => void;
}

/**
 * Renders an input that searches resources by title/name and displays
 * ranked suggestions.
 *
 * @param props - Component configuration.
 * @param props.placeholder - Input placeholder text.
 * @param props.onSelect - Invoked with the selected resource id.
 * @returns Search input with a keyboard-accessible suggestion list.
 *
 * @example
 * <SearchBar
 *   placeholder="Search docs..."
 *   onSelect={(id) => console.log("Selected", id)}
 * />
 */
export default function SearchBar({
    placeholder = "Search resources...",
    onSelect,
}: SearchBarProps): JSX.Element {
    /** Resource collection sourced from Redux state. */
    const resources = useAppSelector((s) => selectResources(s.resources));
    /** Current raw query string entered by the user. */
    const [query, setQuery] = useState<string>("");
    /** Controls visibility of the suggestion popover. */
    const [open, setOpen] = useState<boolean>(false);
    /** Index of the currently keyboard-highlighted result row. */
    const [highlight, setHighlight] = useState<number>(0);
    /** Ref to the search input for future focus-based interactions. */
    const inputRef = useRef<HTMLInputElement | null>(null);
    /** Ref to the container used for outside-click detection. */
    const containerRef = useRef<HTMLDivElement | null>(null);

    /**
     * Scores whether query text matches a candidate label.
     *
     * Matching strategy:
     * 1. Exact substring match (higher score, earlier index favored)
     * 2. Ordered subsequence match (penalized by character gaps)
     *
     * @param q - Query text entered by the user.
     * @param text - Candidate text to evaluate.
     * @returns Match metadata including score and matched character indices,
     * or `null` if there is no match.
     *
     * @example
     * const match = fuzzyMatch("rd", "Resource Doc");
     * // => { score: 79, indices: [0, 9] } (score may vary with position/gaps)
     */
    const fuzzyMatch = (
        q: string,
        text: string,
    ): { score: number; indices: number[] } | null => {
        if (!q) return null;
        const ql = q.toLowerCase();
        const tl = text.toLowerCase();

        // Exact substring check
        const idx = tl.indexOf(ql);
        if (idx !== -1) {
            // give high score, earlier matches rank higher
            const indices: number[] = [];
            for (let i = idx; i < idx + ql.length; i += 1) indices.push(i);
            return { score: 100 - idx, indices };
        }

        // Subsequence match (chars in order, possibly non-contiguous)
        const indices: number[] = [];
        let pos = 0;
        for (let i = 0; i < ql.length; i += 1) {
            const ch = ql[i];
            const found = tl.indexOf(ch, pos);
            if (found === -1) return null;
            indices.push(found);
            pos = found + 1;
        }

        // score inversely proportional to total gaps: contiguous is better
        let gaps = 0;
        for (let i = 1; i < indices.length; i += 1)
            gaps += indices[i] - indices[i - 1] - 1;
        const score = Math.max(1, 80 - gaps);
        return { score, indices };
    };

    const results = query
        ? (resources
              .map((r) => {
                  const title = (r as any).name ?? (r as any).title ?? "";
                  const match = fuzzyMatch(query, title);
                  return match ? { resource: r, match } : null;
              })
              .filter(Boolean) as {
              resource: AnyResource;
              match: { score: number; indices: number[] };
          }[])
        : [];

    /** Sort by descending match score, then lexicographically by title. */
    results.sort((a, b) => {
        if (b.match.score !== a.match.score)
            return b.match.score - a.match.score;
        const ta = (a.resource as any).name ?? (a.resource as any).title ?? "";
        const tb = (b.resource as any).name ?? (b.resource as any).title ?? "";
        return ta.localeCompare(tb);
    });

    useEffect(() => {
        /**
         * Closes the suggestion popover when a click occurs outside container.
         *
         * @param e - Native mouse event from the document listener.
         */
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

    /**
     * Handles keyboard navigation and selection in the suggestion list.
     *
     * Supported keys:
     * - ArrowDown: move highlight down
     * - ArrowUp: move highlight up
     * - Enter: select highlighted result
     * - Escape: close results
     *
     * @param e - Keyboard event from the input element.
     */
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
                onSelect?.(r.resource.id);
                setOpen(false);
                setQuery("");
            }
            e.preventDefault();
        } else if (e.key === "Escape") {
            setOpen(false);
            e.preventDefault();
        }
    };

    /**
     * Wraps matched character indices in a stronger text style.
     *
     * @param text - Source label to render.
     * @param indices - Character indices to emphasize.
     * @returns React nodes with highlighted characters.
     *
     * @example
     * renderHighlighted("Document", [0, 3]);
     */
    const renderHighlighted = (text: string, indices: number[]) => {
        if (!indices || indices.length === 0) return <>{text}</>;
        const parts: React.ReactNode[] = [];
        let last = 0;
        const set = new Set(indices);
        for (let i = 0; i < text.length; i += 1) {
            if (set.has(i)) {
                if (last < i)
                    parts.push(
                        <span key={`t-${last}`}>{text.slice(last, i)}</span>,
                    );
                parts.push(
                    <span key={`h-${i}`} className="font-semibold">
                        {text[i]}
                    </span>,
                );
                last = i + 1;
            }
        }
        if (last < text.length)
            parts.push(<span key={`t-last`}>{text.slice(last)}</span>);
        return <>{parts}</>;
    };

    return (
        <div className="relative w-full max-w-md" ref={containerRef}>
            <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setOpen(e.target.value.length > 0);
                }}
                onFocus={() => setOpen(query.length > 0)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                aria-label="resource-search"
                className="w-full border rounded px-2 py-1"
            />

            {open && results.length > 0 ? (
                <ul className="absolute z-50 mt-1 w-full bg-white border rounded shadow max-h-60 overflow-auto text-sm">
                    {results.slice(0, 8).map(({ resource, match }, i) => (
                        <li key={resource.id}>
                            <button
                                type="button"
                                onClick={() => {
                                    onSelect?.(resource.id);
                                    setOpen(false);
                                    setQuery("");
                                }}
                                className={`w-full text-left px-3 py-2 hover:bg-slate-100 ${i === highlight ? "bg-slate-100" : ""}`}
                            >
                                {renderHighlighted(
                                    (resource as any).name ??
                                        (resource as any).title ??
                                        resource.id,
                                    match.indices,
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
