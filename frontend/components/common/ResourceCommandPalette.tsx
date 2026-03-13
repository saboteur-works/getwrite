"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Image as ImageIcon, Music2, Search } from "lucide-react";
import type { AnyResource } from "../../src/lib/models/types";

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
}: ResourceCommandPaletteProps): JSX.Element | null {
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

        const timer = window.setTimeout(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        }, 0);

        return () => {
            window.clearTimeout(timer);
        };
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

    const handleInputKeyDown = (
        event: React.KeyboardEvent<HTMLInputElement>,
    ) => {
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

        if (event.key === "Escape") {
            event.preventDefault();
            onClose();
        }
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8">
            <button
                type="button"
                className="fixed inset-0 appshell-modal-backdrop"
                aria-label="Close command palette"
                onClick={onClose}
            />
            <section
                role="dialog"
                aria-modal="true"
                aria-label="Open resource command palette"
                className="resource-palette-panel appshell-modal-panel"
            >
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
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={handleInputKeyDown}
                        className="resource-palette-input"
                        placeholder="Search resources..."
                    />
                </div>

                <ul
                    className="resource-palette-list"
                    role="listbox"
                    aria-label="Resources"
                >
                    {filteredResources.length > 0 ? (
                        filteredResources.map((resource, index) => {
                            const isHighlighted = index === highlightedIndex;

                            return (
                                <li
                                    key={resource.id}
                                    className="resource-palette-list-item"
                                >
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={isHighlighted}
                                        className={`resource-palette-item ${isHighlighted ? "resource-palette-item-active" : ""}`}
                                        onMouseEnter={() =>
                                            setHighlightedIndex(index)
                                        }
                                        onClick={() =>
                                            handleSelect(resource.id)
                                        }
                                    >
                                        <span
                                            className="resource-palette-item-icon"
                                            aria-hidden="true"
                                        >
                                            <ResourceTypeIcon
                                                resource={resource}
                                            />
                                        </span>
                                        <span className="resource-palette-item-name">
                                            {getResourceName(resource)}
                                        </span>
                                        <span className="resource-palette-item-type">
                                            {getResourceTypeLabel(resource)}
                                        </span>
                                    </button>
                                </li>
                            );
                        })
                    ) : (
                        <li className="resource-palette-empty">
                            No resources match your search.
                        </li>
                    )}
                </ul>
            </section>
        </div>
    );
}
