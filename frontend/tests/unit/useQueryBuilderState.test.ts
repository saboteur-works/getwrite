import { describe, it, expect } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — renderHook exists at runtime but TS can't resolve it due to react-dom/test-utils having no types in React 19
import { renderHook, act } from "@testing-library/react";
import { useQueryBuilderState } from "../../components/QueryBuilder/useQueryBuilderState";
import type { QueryAST } from "../../src/lib/models/query-ast";

// ─── useQueryBuilderState ─────────────────────────────────────────────────────

describe("useQueryBuilderState — initial state", () => {
  it("starts with one blank group", () => {
    const { result } = renderHook(() => useQueryBuilderState());
    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0].chips).toHaveLength(1);
    expect(result.current.groups[0].chips[0].field).toBeNull();
  });

  it("starts with globalCombinator=and", () => {
    const { result } = renderHook(() => useQueryBuilderState());
    expect(result.current.globalCombinator).toBe("and");
  });

  it("starts in chip mode (isAdvanced=false)", () => {
    const { result } = renderHook(() => useQueryBuilderState());
    expect(result.current.isAdvanced).toBe(false);
    expect(result.current.rawAst).toBeUndefined();
  });
});

describe("useQueryBuilderState — group operations", () => {
  it("onGroupAdd appends a new blank group", () => {
    const { result } = renderHook(() => useQueryBuilderState());
    act(() => result.current.onGroupAdd());
    expect(result.current.groups).toHaveLength(2);
    expect(result.current.groups[1].chips[0].field).toBeNull();
  });

  it("onGroupDelete removes the specified group", () => {
    const { result } = renderHook(() => useQueryBuilderState());
    act(() => result.current.onGroupAdd());
    const idToDelete = result.current.groups[0].id;
    act(() => result.current.onGroupDelete(idToDelete));
    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0].id).not.toBe(idToDelete);
  });

  it("onGroupCombinatorChange updates a group's combinator", () => {
    const { result } = renderHook(() => useQueryBuilderState());
    const groupId = result.current.groups[0].id;
    act(() => result.current.onGroupCombinatorChange(groupId, "or"));
    expect(result.current.groups[0].combinator).toBe("or");
  });

  it("onGlobalCombinatorChange switches the global combinator", () => {
    const { result } = renderHook(() => useQueryBuilderState());
    act(() => result.current.onGlobalCombinatorChange("or"));
    expect(result.current.globalCombinator).toBe("or");
  });
});

describe("useQueryBuilderState — chip operations", () => {
  it("onChipAdd appends a blank chip to the specified group", () => {
    const { result } = renderHook(() => useQueryBuilderState());
    const groupId = result.current.groups[0].id;
    act(() => result.current.onChipAdd(groupId));
    expect(result.current.groups[0].chips).toHaveLength(2);
  });

  it("onChipDelete removes the specified chip", () => {
    const { result } = renderHook(() => useQueryBuilderState());
    const groupId = result.current.groups[0].id;
    act(() => result.current.onChipAdd(groupId));
    const chipId = result.current.groups[0].chips[0].id;
    act(() => result.current.onChipDelete(groupId, chipId));
    expect(result.current.groups[0].chips).toHaveLength(1);
    expect(result.current.groups[0].chips[0].id).not.toBe(chipId);
  });

  it("onChipUpdate merges partial updates onto the target chip", () => {
    const { result } = renderHook(() => useQueryBuilderState());
    const groupId = result.current.groups[0].id;
    const chipId = result.current.groups[0].chips[0].id;
    act(() =>
      result.current.onChipUpdate(groupId, chipId, {
        operator: "is",
        value: "draft",
      }),
    );
    expect(result.current.groups[0].chips[0].operator).toBe("is");
    expect(result.current.groups[0].chips[0].value).toBe("draft");
  });

  it("onChipDuplicate inserts a copy immediately after the source chip", () => {
    const { result } = renderHook(() => useQueryBuilderState());
    const groupId = result.current.groups[0].id;
    act(() => result.current.onChipAdd(groupId));
    const sourceId = result.current.groups[0].chips[0].id;
    act(() => result.current.onChipDuplicate(groupId, sourceId));
    expect(result.current.groups[0].chips).toHaveLength(3);
    expect(result.current.groups[0].chips[1].id).not.toBe(sourceId);
  });

  it("onChipReorder moves a chip from one index to another", () => {
    const { result } = renderHook(() => useQueryBuilderState());
    const groupId = result.current.groups[0].id;
    act(() => result.current.onChipAdd(groupId));
    act(() => result.current.onChipAdd(groupId));
    const idAtZero = result.current.groups[0].chips[0].id;
    act(() => result.current.onChipReorder(groupId, 0, 2));
    expect(result.current.groups[0].chips[2].id).toBe(idAtZero);
  });
});

describe("useQueryBuilderState — reset", () => {
  it("reset() with no args restores blank state", () => {
    const { result } = renderHook(() => useQueryBuilderState());
    act(() => result.current.onGroupAdd());
    act(() => result.current.reset());
    expect(result.current.groups).toHaveLength(1);
    expect(result.current.globalCombinator).toBe("and");
    expect(result.current.isAdvanced).toBe(false);
  });

  it("reset({ groups }) pre-populates chip mode from existing groups", () => {
    const { result } = renderHook(() => useQueryBuilderState());
    const preloadedGroups = [
      { id: "g1", combinator: "or" as const, chips: [] },
      { id: "g2", combinator: "and" as const, chips: [] },
    ];
    act(() =>
      result.current.reset({ groups: preloadedGroups, combinator: "or" }),
    );
    expect(result.current.groups).toHaveLength(2);
    expect(result.current.globalCombinator).toBe("or");
    expect(result.current.isAdvanced).toBe(false);
  });

  it("reset({ rawAst }) sets advanced mode", () => {
    const { result } = renderHook(() => useQueryBuilderState());
    const ast: QueryAST = { op: "exists", field: "status" };
    act(() => result.current.reset({ rawAst: ast }));
    expect(result.current.isAdvanced).toBe(true);
    expect(result.current.rawAst).toEqual(ast);
    expect(result.current.groups).toHaveLength(0);
  });
});

describe("useQueryBuilderState — buildAst", () => {
  it("returns null when no complete conditions are set", () => {
    const { result } = renderHook(() => useQueryBuilderState());
    expect(result.current.buildAst()).toBeNull();
  });

  it("returns the rawAst in advanced mode", () => {
    const { result } = renderHook(() => useQueryBuilderState());
    const ast: QueryAST = { op: "exists", field: "status" };
    act(() => result.current.reset({ rawAst: ast }));
    expect(result.current.buildAst()).toEqual(ast);
  });
});

describe("useQueryBuilderState — onRestoreFromAdvanced", () => {
  it("exits advanced mode and restores chip groups", () => {
    const { result } = renderHook(() => useQueryBuilderState());
    const ast: QueryAST = { op: "exists", field: "status" };
    act(() => result.current.reset({ rawAst: ast }));
    const restoredGroups = [
      { id: "g1", combinator: "and" as const, chips: [] },
    ];
    act(() => result.current.onRestoreFromAdvanced(restoredGroups, "or"));
    expect(result.current.isAdvanced).toBe(false);
    expect(result.current.rawAst).toBeUndefined();
    expect(result.current.groups).toEqual(restoredGroups);
    expect(result.current.globalCombinator).toBe("or");
  });
});
