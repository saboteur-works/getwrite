"use client";

import React, { useCallback, useState } from "react";
import FilterGroup, {
    type GroupChip,
    type GroupCombinator,
} from "./FilterGroup";
import type { FilterChipField } from "./FilterChip";
import type { QueryAST } from "../../src/lib/models/query-ast";
import AdvancedModeToggle from "./AdvancedModeToggle";
import { groupsToAst } from "./ast-chip-bridge";
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
    /** Saved queries shown in the field picker's "Saved queries" section. */
    savedQueries?: Array<{id: string; name: string}>;
    /** Overall match count displayed in the footer. Omit to hide. */
    matchCount?: number;
    /**
     * When true, the query uses nesting beyond two levels. Shows a banner
     * and disables group/chip mutation.
     */
    isAdvanced?: boolean;
    /**
     * Raw AST for advanced queries that cannot be represented as chips.
     * Used to pre-populate the JSON editor when the user opens advanced mode.
     * If omitted when isAdvanced=true, the editor derives the AST from the
     * current chip groups.
     */
    rawAst?: QueryAST;
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
    /**
     * Called when the user edits the AST in the JSON editor and the result
     * is two-level compatible — the groups and combinator to restore.
     */
    onRestoreFromAdvanced?: (
        groups: QueryGroup[],
        globalCombinator: GlobalCombinator,
    ) => void;
    /** When provided, a "Save query" button appears in the footer. */
    onSaveRequest?: () => void;
}

// ─── QueryBuilder ─────────────────────────────────────────────────────────────

export default function QueryBuilder({
    groups,
    globalCombinator,
    availableFields,
    savedQueries,
    matchCount,
    isAdvanced = false,
    rawAst,
    onGlobalCombinatorChange,
    onGroupCombinatorChange,
    onGroupAdd,
    onGroupDelete,
    onChipUpdate,
    onChipAdd,
    onChipDelete,
    onChipDuplicate,
    onChipReorder,
    onRestoreFromAdvanced,
    onSaveRequest,
}: QueryBuilderProps): JSX.Element {
    const [editorOpen, setEditorOpen] = useState(false);

    const showGroupDelete = Boolean(onGroupDelete) && groups.length > 1 && !isAdvanced;
    const nextGlobal: GlobalCombinator = globalCombinator === "and" ? "or" : "and";

    const handleOpenEditor = useCallback(() => {
        setEditorOpen(true);
    }, []);

    const handleRestoreFromAdvanced = useCallback(
        (restoredGroups: QueryGroup[], restoredCombinator: GlobalCombinator) => {
            setEditorOpen(false);
            onRestoreFromAdvanced?.(restoredGroups, restoredCombinator);
        },
        [onRestoreFromAdvanced],
    );

    const handleCancelEditor = useCallback(() => {
        setEditorOpen(false);
    }, []);

    const editorJson = React.useMemo((): string => {
        if (rawAst) return JSON.stringify(rawAst, null, 2);
        const ast = groupsToAst(groups, globalCombinator);
        return ast ? JSON.stringify(ast, null, 2) : "{}";
    }, [rawAst, groups, globalCombinator]);

    return (
        <div className="query-builder">
            {/* ── Advanced mode banner ── */}
            {isAdvanced && !editorOpen && (
                <div className="query-builder__advanced" role="status">
                    <span className="query-builder__advanced-label">
                        Query uses advanced nesting — chip editing is disabled
                    </span>
                    <button
                        type="button"
                        className="query-builder__advanced-edit"
                        onClick={handleOpenEditor}
                    >
                        Edit in advanced mode
                    </button>
                </div>
            )}

            {/* ── Advanced JSON editor ── */}
            {editorOpen && (
                <AdvancedModeToggle
                    initialJson={editorJson}
                    availableFields={availableFields}
                    onRestore={handleRestoreFromAdvanced}
                    onCancel={handleCancelEditor}
                />
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
                                    savedQueries={savedQueries}
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

            {/* ── Footer: add group + overall match count + save ── */}
            <div className="query-builder__footer">
                <button
                    type="button"
                    className="query-builder__add-group"
                    disabled={isAdvanced}
                    onClick={onGroupAdd}
                >
                    + Add group
                </button>
                <div className="query-builder__footer-right">
                    {matchCount !== undefined && (
                        <span className="query-builder__match-count">
                            [{" "}
                            {matchCount}{" "}
                            {matchCount === 1 ? "match" : "matches"}{" "}
                            ]
                        </span>
                    )}
                    {onSaveRequest && (
                        <button
                            type="button"
                            className="query-builder__save"
                            onClick={onSaveRequest}
                        >
                            Save query
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
