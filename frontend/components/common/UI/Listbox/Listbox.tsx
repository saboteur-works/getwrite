"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "../utils";

export interface ListboxOption {
    value: string;
    label: string;
    /** Optional secondary label shown to the right of the main label. */
    meta?: string;
}

export interface ListboxProps {
    options: ListboxOption[];
    highlightedIndex: number;
    onSelect: (value: string) => void;
    onHighlightChange?: (index: number) => void;
    /** When true the list is positioned absolutely relative to its nearest positioned parent. */
    anchored?: boolean;
    className?: string;
    "aria-label"?: string;
}

/**
 * Shared dropdown result list for autocomplete surfaces.
 * Renders with `role="listbox"` / `role="option"` semantics and brand-token styling.
 *
 * Filtering and open/close state stay in the call site. This component only
 * renders the result list when `options.length > 0`.
 */
export default function Listbox({
    options,
    highlightedIndex,
    onSelect,
    onHighlightChange,
    anchored = true,
    className,
    "aria-label": ariaLabel = "Search results",
}: ListboxProps): JSX.Element | null {
    const listRef = useRef<HTMLUListElement>(null);
    const highlightedRef = useRef<HTMLLIElement>(null);

    useEffect(() => {
        highlightedRef.current?.scrollIntoView?.({ block: "nearest" });
    }, [highlightedIndex]);

    if (options.length === 0) return null;

    return (
        <ul
            ref={listRef}
            role="listbox"
            aria-label={ariaLabel}
            className={cn("listbox", anchored && "listbox--anchored", className)}
        >
            {options.map((opt, i) => {
                const isHighlighted = i === highlightedIndex;
                return (
                    <li
                        key={opt.value}
                        ref={isHighlighted ? highlightedRef : null}
                        role="option"
                        aria-selected={isHighlighted}
                    >
                        <button
                            type="button"
                            tabIndex={-1}
                            className={cn(
                                "listbox-option",
                                isHighlighted && "listbox-option--highlighted",
                            )}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => onSelect(opt.value)}
                            onMouseEnter={() => onHighlightChange?.(i)}
                        >
                            <span className="listbox-option-label">{opt.label}</span>
                            {opt.meta ? (
                                <span className="listbox-option-meta">{opt.meta}</span>
                            ) : null}
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
