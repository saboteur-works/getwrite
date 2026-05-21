"use client";

import { useCallback, useState } from "react";
import type { QueryGroup, GlobalCombinator } from "./QueryBuilder";
import type { GroupChip, GroupCombinator } from "./FilterGroup";
import type { QueryAST } from "../../src/lib/models/query-ast";
import { groupsToAst } from "./ast-chip-bridge";
import { generateUUID } from "../../src/lib/models/uuid";

// ─── ID factories ─────────────────────────────────────────────────────────────

function makeGroupId(): string {
    return `g-${generateUUID()}`;
}

function makeChipId(): string {
    return `c-${generateUUID()}`;
}

function makeBlankGroup(): QueryGroup {
    return {
        id: makeGroupId(),
        combinator: "and",
        chips: [{ id: makeChipId(), field: null, operator: null, value: null }],
    };
}

function makeBlankChip(): GroupChip {
    return { id: makeChipId(), field: null, operator: null, value: null };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResetOptions {
    /** Pre-populate with specific groups (chip mode). */
    groups?: QueryGroup[];
    combinator?: GlobalCombinator;
    /** When provided, sets advanced mode with this AST (groups are ignored). */
    rawAst?: QueryAST;
}

export interface UseQueryBuilderStateReturn {
    groups: QueryGroup[];
    globalCombinator: GlobalCombinator;
    isAdvanced: boolean;
    rawAst: QueryAST | undefined;
    /** Returns the current QueryAST, or null if no complete conditions are set. */
    buildAst: () => QueryAST | null;
    /** Resets to blank state, or pre-populates from existing groups/AST. */
    reset: (options?: ResetOptions) => void;
    onGlobalCombinatorChange: (combinator: GlobalCombinator) => void;
    onGroupCombinatorChange: (groupId: string, combinator: GroupCombinator) => void;
    onGroupAdd: () => void;
    onGroupDelete: (groupId: string) => void;
    onChipUpdate: (groupId: string, chipId: string, updates: Partial<Omit<GroupChip, "id">>) => void;
    onChipAdd: (groupId: string) => void;
    onChipDelete: (groupId: string, chipId: string) => void;
    onChipDuplicate: (groupId: string, chipId: string) => void;
    onChipReorder: (groupId: string, fromIndex: number, toIndex: number) => void;
    onRestoreFromAdvanced: (groups: QueryGroup[], combinator: GlobalCombinator) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useQueryBuilderState(): UseQueryBuilderStateReturn {
    const [groups, setGroups] = useState<QueryGroup[]>(() => [makeBlankGroup()]);
    const [globalCombinator, setGlobalCombinator] = useState<GlobalCombinator>("and");
    const [isAdvanced, setIsAdvanced] = useState(false);
    const [rawAst, setRawAst] = useState<QueryAST | undefined>(undefined);

    const reset = useCallback((options?: ResetOptions) => {
        if (options?.rawAst) {
            setIsAdvanced(true);
            setRawAst(options.rawAst);
            setGroups([]);
            setGlobalCombinator("and");
        } else if (options?.groups) {
            setIsAdvanced(false);
            setRawAst(undefined);
            setGroups(options.groups);
            setGlobalCombinator(options.combinator ?? "and");
        } else {
            setIsAdvanced(false);
            setRawAst(undefined);
            setGroups([makeBlankGroup()]);
            setGlobalCombinator("and");
        }
    }, []);

    const buildAst = useCallback((): QueryAST | null => {
        if (isAdvanced && rawAst) return rawAst;
        return groupsToAst(groups, globalCombinator);
    }, [isAdvanced, rawAst, groups, globalCombinator]);

    const onGlobalCombinatorChange = useCallback((combinator: GlobalCombinator) => {
        setGlobalCombinator(combinator);
    }, []);

    const onGroupCombinatorChange = useCallback((groupId: string, combinator: GroupCombinator) => {
        setGroups((prev) =>
            prev.map((g) => g.id === groupId ? { ...g, combinator } : g),
        );
    }, []);

    const onGroupAdd = useCallback(() => {
        setGroups((prev) => [...prev, makeBlankGroup()]);
    }, []);

    const onGroupDelete = useCallback((groupId: string) => {
        setGroups((prev) => prev.filter((g) => g.id !== groupId));
    }, []);

    const onChipUpdate = useCallback((
        groupId: string,
        chipId: string,
        updates: Partial<Omit<GroupChip, "id">>,
    ) => {
        setGroups((prev) =>
            prev.map((g) =>
                g.id !== groupId
                    ? g
                    : {
                          ...g,
                          chips: g.chips.map((c) =>
                              c.id === chipId ? { ...c, ...updates } : c,
                          ),
                      },
            ),
        );
    }, []);

    const onChipAdd = useCallback((groupId: string) => {
        setGroups((prev) =>
            prev.map((g) =>
                g.id !== groupId
                    ? g
                    : { ...g, chips: [...g.chips, makeBlankChip()] },
            ),
        );
    }, []);

    const onChipDelete = useCallback((groupId: string, chipId: string) => {
        setGroups((prev) =>
            prev.map((g) =>
                g.id !== groupId
                    ? g
                    : { ...g, chips: g.chips.filter((c) => c.id !== chipId) },
            ),
        );
    }, []);

    const onChipDuplicate = useCallback((groupId: string, chipId: string) => {
        setGroups((prev) =>
            prev.map((g) => {
                if (g.id !== groupId) return g;
                const index = g.chips.findIndex((c) => c.id === chipId);
                if (index === -1) return g;
                const duplicate: GroupChip = { ...g.chips[index], id: makeChipId() };
                const chips = [...g.chips];
                chips.splice(index + 1, 0, duplicate);
                return { ...g, chips };
            }),
        );
    }, []);

    const onChipReorder = useCallback((groupId: string, fromIndex: number, toIndex: number) => {
        setGroups((prev) =>
            prev.map((g) => {
                if (g.id !== groupId) return g;
                const chips = [...g.chips];
                const [moved] = chips.splice(fromIndex, 1);
                chips.splice(toIndex, 0, moved);
                return { ...g, chips };
            }),
        );
    }, []);

    const onRestoreFromAdvanced = useCallback((
        restoredGroups: QueryGroup[],
        restoredCombinator: GlobalCombinator,
    ) => {
        setIsAdvanced(false);
        setRawAst(undefined);
        setGroups(restoredGroups);
        setGlobalCombinator(restoredCombinator);
    }, []);

    return {
        groups,
        globalCombinator,
        isAdvanced,
        rawAst,
        buildAst,
        reset,
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
    };
}
