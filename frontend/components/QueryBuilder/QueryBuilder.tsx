"use client";

import React from "react";
import FilterGroup, {
    type GroupChip,
    type GroupCombinator,
} from "./FilterGroup";
import type { FilterChipField } from "./FilterChip";
import "./query-builder.css";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GlobalCombinator = "and" | "or";

export interface QueryGroup {
    id: string;
    /** Combinator joining chips within this group. */
    combinator: GroupCombinator;
    /** Ordered chip conditions. */
    chips: GroupChip[];
    /** Optional per-group match subtotal. */
    matchCount?: number;
}

export interface QueryBuilderProps {
    /** Ordered list of filter groups. */
    groups: QueryGroup[];
    /**
     * Single combinator shared across ALL between-group joins.
     * No mixed `g1 AND g2 OR g3` — all joins use the same operator.
     */
    globalCombinator: GlobalCombinator;
    /** Fields available in every chip's field picker. */
    availableFields?: FilterChipField[];
    /** Overall match count displayed in the footer. Omit to hide. */
    matchCount?: number;
    /**
     * When true, the query uses nesting beyond two levels. Shows a banner
     * and disables group/chip mutation. The actual text editor is wired
     * in Task 17 via onEditAdvanced.
     */
    isAdvanced?: boolean;
    onGlobalCombinatorChange?: (combinator: GlobalCombinator) => void;
    onGroupCombinatorChange?: (groupId: string, combinator: GroupCombinator) => void;
    onGroupAdd?: () => void;
    /** When provided and groups.length > 1, a delete affordance appears per group. */
    onGroupDelete?: (groupId: string) => void;
    onChipUpdate?: (
        groupId: string,
        chipId: string,
        updates: Partial<Omit<GroupChip, "id">>,
    ) => void;
    onChipAdd?: (groupId: string) => void;
    onChipDelete?: (groupId: string, chipId: string) => void;
    onChipDuplicate?: (groupId: string, chipId: string) => void;
    onChipReorder?: (
        groupId: string,
        fromIndex: number,
        toIndex: number,
    ) => void;
    /** Opens the text/AST editor for advanced queries. Wired in Task 17. */
    onEditAdvanced?: () => void;
}

// ─── QueryBuilder ─────────────────────────────────────────────────────────────

export default function QueryBuilder({
    groups,
    globalCombinator,
    availableFields,
    matchCount,
    isAdvanced = false,
    onGlobalCombinatorChange,
    onGroupCombinatorChange,
    onGroupAdd,
    onGroupDelete,
    onChipUpdate,
    onChipAdd,
    onChipDelete,
    onChipDuplicate,
    onChipReorder,
    onEditAdvanced,
}: QueryBuilderProps): JSX.Element {
    const showGroupDelete = Boolean(onGroupDelete) && groups.length > 1 && !isAdvanced;
    const nextGlobal: GlobalCombinator = globalCombinator === "and" ? "or" : "and";

    return (
        <div className="query-builder">
            {/* ── Advanced mode banner ── */}
            {isAdvanced && (
                <div className="query-builder__advanced" role="status">
                    <span className="query-builder__advanced-label">
                        Query uses advanced nesting — chip editing is disabled
                    </span>
                    {onEditAdvanced && (
                        <button
                            type="button"
                            className="query-builder__advanced-edit"
                            onClick={onEditAdvanced}
                        >
                            Edit in advanced mode
                        </button>
                    )}
                </div>
            )}

            {/* ── Group list ── */}
            <div className="query-builder__groups">
                {groups.length === 0 ? (
                    <div className="query-builder__empty">
                        No conditions — click "+ Add group" to start
                    </div>
                ) : (
                    groups.map((group, index) => (
                        <React.Fragment key={group.id}>
                            {/* Between-group combinator pill */}
                            {index > 0 && (
                                <div className="query-builder__pill-row">
                                    <button
                                        type="button"
                                        className="query-builder__pill"
                                        disabled={isAdvanced}
                                        aria-label={`Groups joined by ${globalCombinator.toUpperCase()}. Click to switch to ${nextGlobal.toUpperCase()}.`}
                                        onClick={() =>
                                            onGlobalCombinatorChange?.(nextGlobal)
                                        }
                                    >
                                        {globalCombinator.toUpperCase()}
                                    </button>
                                </div>
                            )}

                            {/* Group row */}
                            <div className="query-builder__group-row">
                                <FilterGroup
                                    combinator={group.combinator}
                                    chips={group.chips}
                                    availableFields={availableFields}
                                    matchCount={group.matchCount}
                                    onCombinatorChange={
                                        isAdvanced
                                            ? undefined
                                            : (combinator) =>
                                                  onGroupCombinatorChange?.(
                                                      group.id,
                                                      combinator,
                                                  )
                                    }
                                    onChipUpdate={
                                        isAdvanced
                                            ? undefined
                                            : (chipId, updates) =>
                                                  onChipUpdate?.(
                                                      group.id,
                                                      chipId,
                                                      updates,
                                                  )
                                    }
                                    onChipAdd={
                                        isAdvanced
                                            ? undefined
                                            : () => onChipAdd?.(group.id)
                                    }
                                    onChipDelete={
                                        isAdvanced
                                            ? undefined
                                            : (chipId) =>
                                                  onChipDelete?.(
                                                      group.id,
                                                      chipId,
                                                  )
                                    }
                                    onChipDuplicate={
                                        isAdvanced
                                            ? undefined
                                            : (chipId) =>
                                                  onChipDuplicate?.(
                                                      group.id,
                                                      chipId,
                                                  )
                                    }
                                    onChipReorder={
                                        isAdvanced
                                            ? undefined
                                            : (fromIndex, toIndex) =>
                                                  onChipReorder?.(
                                                      group.id,
                                                      fromIndex,
                                                      toIndex,
                                                  )
                                    }
                                />
                                {showGroupDelete && (
                                    <button
                                        type="button"
                                        className="query-builder__group-delete"
                                        aria-label="Delete group"
                                        onClick={() =>
                                            onGroupDelete?.(group.id)
                                        }
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        </React.Fragment>
                    ))
                )}
            </div>

            {/* ── Footer: add group + overall match count ── */}
            <div className="query-builder__footer">
                <button
                    type="button"
                    className="query-builder__add-group"
                    disabled={isAdvanced}
                    onClick={onGroupAdd}
                >
                    + Add group
                </button>
                {matchCount !== undefined && (
                    <span className="query-builder__match-count">
                        [{" "}
                        {matchCount}{" "}
                        {matchCount === 1 ? "match" : "matches"}{" "}
                        ]
                    </span>
                )}
            </div>
        </div>
    );
}
