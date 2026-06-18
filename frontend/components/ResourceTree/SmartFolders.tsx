"use client";

import { useState } from "react";
import { Search, Pencil, Trash2, Plus } from "lucide-react";
import { ChevronDown, ChevronRight } from "./ResourceTreeIcons";
import Button from "../common/UI/Button/Button";
import useAppSelector from "../../src/store/hooks";
import {
  selectSavedQueriesList,
  selectIsLoadingQueries,
  type SavedQuery,
} from "../../src/store/querySlice";

export interface SmartFoldersProps {
  /** ID of the currently active smart folder, or undefined when none. */
  selectedQueryId?: string;
  /** Called when the user clicks a smart folder row to run it. */
  onSelect: (query: SavedQuery) => void;
  /** When provided, a "+" button appears in the section header. */
  onNewQuery?: () => void;
  /** When provided, an edit icon appears on hover for each row. */
  onEditQuery?: (query: SavedQuery) => void;
  /** When provided, a delete icon appears on hover for each row. */
  onDeleteQuery?: (queryId: string) => void;
}

export default function SmartFolders({
  selectedQueryId,
  onSelect,
  onNewQuery,
  onEditQuery,
  onDeleteQuery,
}: SmartFoldersProps): JSX.Element | null {
  const queries = useAppSelector(selectSavedQueriesList);
  const isLoading = useAppSelector(selectIsLoadingQueries);
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!isLoading && queries.length === 0 && !onNewQuery) return null;

  return (
    <div className="mt-2 mb-8" aria-label="Smart folders">
      {/* Section header */}
      <div className="flex items-center">
        <button
          type="button"
          className="flex flex-1 items-center gap-1 px-0 py-1 text-left"
          onClick={() => setIsCollapsed((c) => !c)}
          aria-expanded={!isCollapsed}
        >
          <span className="w-5 flex-shrink-0 text-gw-secondary">
            {isCollapsed ? (
              <ChevronRight className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] font-semibold text-gw-secondary">
            Smart folders
          </span>
        </button>
        {onNewQuery && (
          <Button
            variant="ghost"
            size="xs"
            onClick={onNewQuery}
            aria-label="New smart folder"
            className="shrink-0"
          >
            <Plus size={12} aria-hidden="true" />
          </Button>
        )}
      </div>

      {/* Query rows */}
      {!isCollapsed && (
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
                  className="group resource-tree-item flex items-center"
                >
                  <button
                    type="button"
                    className={`resource-tree-button min-w-0 flex-1${isSelected ? " resource-tree-button--selected" : ""}`}
                    onClick={() => onSelect(query)}
                    aria-current={isSelected ? "page" : undefined}
                  >
                    <div className="resource-tree-item-row">
                      <Search
                        className="w-3.5 h-3.5 flex-shrink-0"
                        aria-hidden="true"
                      />
                      <div className="truncate">{query.name}</div>
                    </div>
                  </button>
                  {(onEditQuery || onDeleteQuery) && (
                    <div className="flex shrink-0 items-center opacity-0 transition-opacity duration-100 group-hover:opacity-100 focus-within:opacity-100 pr-0.5">
                      {onEditQuery && (
                        <Button
                          variant="ghost"
                          size="xs"
                          aria-label={`Edit ${query.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditQuery(query);
                          }}
                        >
                          <Pencil size={11} aria-hidden="true" />
                        </Button>
                      )}
                      {onDeleteQuery && (
                        <Button
                          variant="ghost"
                          size="xs"
                          aria-label={`Delete ${query.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteQuery(query.id);
                          }}
                        >
                          <Trash2 size={11} aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
