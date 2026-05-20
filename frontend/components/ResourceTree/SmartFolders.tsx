"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { ChevronDown, ChevronRight } from "./ResourceTreeIcons";
import useAppSelector from "../../src/store/hooks";
import {
    selectSavedQueriesList,
    selectIsLoadingQueries,
    type SavedQuery,
} from "../../src/store/querySlice";

export interface SmartFoldersProps {
    /** ID of the currently active smart folder, or undefined when none. */
    selectedQueryId?: string;
    /** Called when the user clicks a smart folder row. */
    onSelect: (query: SavedQuery) => void;
}

export default function SmartFolders({
    selectedQueryId,
    onSelect,
}: SmartFoldersProps): JSX.Element | null {
    const queries = useAppSelector(selectSavedQueriesList);
    const isLoading = useAppSelector(selectIsLoadingQueries);
    const [collapsed, setCollapsed] = useState(false);

    if (!isLoading && queries.length === 0) return null;

    return (
        <div className="mt-2 mb-8" aria-label="Smart folders">
            {/* Section header */}
            <button
                type="button"
                className="flex w-full items-center gap-1 px-0 py-1 text-left"
                onClick={() => setCollapsed((c) => !c)}
                aria-expanded={!collapsed}
            >
                <span className="w-5 flex-shrink-0 text-gw-secondary">
                    {collapsed ? (
                        <ChevronRight className="w-3 h-3" />
                    ) : (
                        <ChevronDown className="w-3 h-3" />
                    )}
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] font-semibold text-gw-secondary">
                    Smart folders
                </span>
            </button>

            {/* Query rows */}
            {!collapsed && (
                <div>
                    {isLoading ? (
                        <div className="px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-gw-dim">
                            Loading…
                        </div>
                    ) : (
                        queries.map((query) => {
                            const isSelected = query.id === selectedQueryId;
                            return (
                                <div
                                    key={query.id}
                                    className="resource-tree-item"
                                >
                                    <button
                                        type="button"
                                        className={`resource-tree-button${isSelected ? " resource-tree-button--selected" : ""}`}
                                        onClick={() => onSelect(query)}
                                        aria-current={
                                            isSelected ? "page" : undefined
                                        }
                                    >
                                        <div className="resource-tree-item-row">
                                            <Search
                                                className="w-3.5 h-3.5 flex-shrink-0"
                                                aria-hidden="true"
                                            />
                                            <div className="truncate">
                                                {query.name}
                                            </div>
                                        </div>
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}
