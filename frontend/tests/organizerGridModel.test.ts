import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildOrganizerGridModel,
  buildOrganizerPhoneGroups,
  type OrganizerGridAxisInput,
  type OrganizerGridResult,
} from "../components/WorkArea/Views/OrganizerView/organizerGridModel";
import type {
  OrganizerAxis,
  OrganizerAxisValue,
  OrganizerGridCard,
} from "../src/lib/models/organizer-grid-types";
import type { MetadataValue } from "../src/lib/models/types";

const card = (id: string): OrganizerGridCard => ({ id, kind: "resource" });
const line = (key: string, label: string = key): OrganizerAxisValue => ({
  key,
  label,
  kind: "value",
  isDropTarget: true,
  value: key,
});
const fieldAxis = (
  axis: OrganizerAxis,
  keys: string[],
  values: Record<string, MetadataValue | undefined>,
  extra: OrganizerAxisValue[] = [],
): OrganizerGridAxisInput => ({
  axis,
  list: { axis, values: [...keys.map((k) => line(k)), ...extra] },
  values: new Map(Object.entries(values)),
});
const noAxis: OrganizerGridAxisInput = {
  axis: "none",
  list: null,
  values: new Map(),
};
const orderAxis: OrganizerGridAxisInput = {
  axis: "order",
  list: null,
  values: new Map(),
};
const cellIds = (m: OrganizerGridResult, r: string, c: string): string[] =>
  m.cells
    .find((x) => x.rowKey === r && x.columnKey === c)!
    .placements.map((p) => p.cardId);

describe("buildOrganizerGridModel: axis types", () => {
  const cards = [card("a"), card("b"), card("c")];

  it("places by status (string)", () => {
    const m = buildOrganizerGridModel({
      cards,
      rows: fieldAxis({ kind: "status" }, ["draft", "done"], {
        a: "draft",
        b: "done",
      }),
      columns: orderAxis,
      cap: null,
    });
    expect(cellIds(m, "draft", "order")).toEqual(["a"]);
    expect(cellIds(m, "done", "order")).toEqual(["b"]);
    expect(cellIds(m, "none", "order")).toEqual(["c"]);
  });

  it("places by subtype, comparing labels the way the project does", () => {
    const m = buildOrganizerGridModel({
      cards,
      rows: fieldAxis({ kind: "subtype" }, ["Scene"], { a: " scene " }),
      columns: orderAxis,
      cap: null,
    });
    expect(cellIds(m, "Scene", "order")).toEqual(["a"]);
  });

  it("places by select field on columns", () => {
    const m = buildOrganizerGridModel({
      cards,
      rows: noAxis,
      columns: fieldAxis({ kind: "field", key: "pov" }, ["x", "y"], {
        a: "y",
        b: "x",
      }),
      cap: null,
    });
    expect(cellIds(m, "all", "x")).toEqual(["b"]);
    expect(cellIds(m, "all", "y")).toEqual(["a"]);
    expect(cellIds(m, "all", "none")).toEqual(["c"]);
  });

  it("places by multiselect", () => {
    const m = buildOrganizerGridModel({
      cards,
      rows: fieldAxis({ kind: "field", key: "t" }, ["p", "q"], {
        a: ["p", "q"],
      }),
      columns: orderAxis,
      cap: null,
    });
    expect(cellIds(m, "p", "order")).toEqual(["a"]);
    expect(cellIds(m, "q", "order")).toEqual(["a"]);
  });

  it("places by resource-ref and multi-resource-ref by id, null id to Other", () => {
    const m = buildOrganizerGridModel({
      cards,
      rows: fieldAxis({ kind: "field", key: "r" }, ["id1", "id2"], {
        a: { id: "id1", name: "One" },
        b: [
          { id: "id2", name: "Two" },
          { id: "id1", name: "One" },
        ],
        c: { id: null, name: "Gone" },
      }),
      columns: orderAxis,
      cap: null,
    });
    expect(cellIds(m, "id1", "order")).toEqual(["a", "b"]);
    expect(cellIds(m, "id2", "order")).toEqual(["b"]);
    expect(cellIds(m, "other", "order")).toEqual(["c"]);
  });

  it("uses one single row and column for none and order", () => {
    const m = buildOrganizerGridModel({
      cards,
      rows: noAxis,
      columns: orderAxis,
      cap: null,
    });
    expect(m.rows).toHaveLength(1);
    expect(m.columns).toHaveLength(1);
  });

  it("refuses a field axis without a value list", () => {
    expect(() =>
      buildOrganizerGridModel({
        cards,
        rows: { axis: { kind: "status" }, list: null, values: new Map() },
        columns: orderAxis,
        cap: null,
      }),
    ).toThrow(RangeError);
  });
});

describe("buildOrganizerGridModel: None and Other values", () => {
  it("always has None, last, even when empty", () => {
    const m = buildOrganizerGridModel({
      cards: [card("a")],
      rows: fieldAxis({ kind: "status" }, ["draft"], { a: "draft" }),
      columns: orderAxis,
      cap: null,
    });
    expect(m.rows.map((r) => r.key)).toEqual(["draft", "none"]);
    expect(m.rows[1].kind).toBe("none");
    expect(cellIds(m, "none", "order")).toEqual([]);
  });

  it("puts Other values before None, marked in text, and never a drop target", () => {
    const m = buildOrganizerGridModel({
      cards: [card("a"), card("b")],
      rows: fieldAxis({ kind: "status" }, ["draft"], { a: "old", b: "draft" }),
      columns: orderAxis,
      cap: null,
    });
    expect(m.rows.map((r) => r.key)).toEqual(["draft", "other", "none"]);
    const other = m.rows[1];
    expect(other.kind).toBe("other");
    expect(other.label).toMatch(/other values/i);
    expect(other.isDropTarget).toBe(false);
    expect(cellIds(m, "other", "order")).toEqual(["a"]);
  });

  it("treats blank strings and empty arrays as None", () => {
    const m = buildOrganizerGridModel({
      cards: [card("a"), card("b")],
      rows: fieldAxis({ kind: "field", key: "t" }, ["p"], { a: "  ", b: [] }),
      columns: orderAxis,
      cap: null,
    });
    expect(cellIds(m, "none", "order")).toEqual(["a", "b"]);
  });

  it("does not show Other values when no card needs it and the list has none", () => {
    const m = buildOrganizerGridModel({
      cards: [card("a")],
      rows: fieldAxis({ kind: "status" }, ["draft"], { a: "draft" }),
      columns: orderAxis,
      cap: null,
    });
    expect(m.rows.some((r) => r.kind === "other")).toBe(false);
  });
});

describe("buildOrganizerGridModel: duplicates", () => {
  it("places a multi-value card in each cell in tree order, marking later appearances", () => {
    const m = buildOrganizerGridModel({
      cards: [card("a"), card("b"), card("c")],
      rows: fieldAxis({ kind: "field", key: "t" }, ["p", "q", "r"], {
        a: ["p", "q", "r"],
        b: ["q"],
        c: ["q", "p"],
      }),
      columns: orderAxis,
      cap: null,
    });
    expect(cellIds(m, "p", "order")).toEqual(["a", "c"]);
    expect(cellIds(m, "q", "order")).toEqual(["a", "b", "c"]);
    const aPlacements = m.cells
      .flatMap((c) => c.placements)
      .filter((p) => p.cardId === "a");
    expect(aPlacements.map((p) => p.appearance).sort()).toEqual([0, 1, 2]);
    expect(aPlacements.every((p) => p.alsoInOtherCells === 2)).toBe(true);
    const bPlacement = m.cells
      .flatMap((c) => c.placements)
      .find((p) => p.cardId === "b")!;
    expect(bPlacement.appearance).toBe(0);
    expect(bPlacement.alsoInOtherCells).toBe(0);
  });

  it("counts a card once however many cells it is in", () => {
    const m = buildOrganizerGridModel({
      cards: [card("a")],
      rows: fieldAxis({ kind: "field", key: "t" }, ["p", "q"], {
        a: ["p", "q"],
      }),
      columns: orderAxis,
      cap: null,
    });
    expect(m.shownCardCount).toBe(1);
  });
});

describe("buildOrganizerGridModel: empty grid", () => {
  it("has the None lines, empty cells and no cards", () => {
    const m = buildOrganizerGridModel({
      cards: [],
      rows: fieldAxis({ kind: "status" }, ["draft"], {}),
      columns: fieldAxis({ kind: "field", key: "t" }, ["p"], {}),
      cap: null,
    });
    expect(m.rows.map((r) => r.key)).toEqual(["draft", "none"]);
    expect(m.columns.map((r) => r.key)).toEqual(["p", "none"]);
    expect(m.cells).toHaveLength(4);
    expect(m.cells.every((c) => c.placements.length === 0)).toBe(true);
    expect(m.shownCardCount).toBe(0);
    expect(m.notShownCount).toBe(0);
  });
});

describe("buildOrganizerGridModel: cap", () => {
  const cards = ["a", "b", "c", "d"].map(card);
  const rows = fieldAxis({ kind: "field", key: "t" }, ["p", "q"], {
    a: ["p", "q"],
    b: "p",
    c: "q",
    d: "p",
  });

  it("counts cards, not appearances, and keeps the first cards in tree order", () => {
    const m = buildOrganizerGridModel({
      cards,
      rows,
      columns: orderAxis,
      cap: 2,
    });
    expect(m.shownCardCount).toBe(2);
    expect(m.notShownCount).toBe(2);
    expect(m.shownCardIds).toEqual(["a", "b"]);
    expect(cellIds(m, "p", "order")).toEqual(["a", "b"]);
    expect(cellIds(m, "q", "order")).toEqual(["a"]);
  });

  it("reports nothing not shown with no cap or a cap above the count", () => {
    const none = buildOrganizerGridModel({
      cards,
      rows,
      columns: orderAxis,
      cap: null,
    });
    expect(none.notShownCount).toBe(0);
    const big = buildOrganizerGridModel({
      cards,
      rows,
      columns: orderAxis,
      cap: cards.length + 1,
    });
    expect(big.notShownCount).toBe(0);
    expect(big.shownCardCount).toBe(cards.length);
  });

  it("rejects a bad cap rather than reading it as no cap", () => {
    expect(() =>
      buildOrganizerGridModel({ cards, rows, columns: orderAxis, cap: 0 }),
    ).toThrow(RangeError);
  });
});

describe("buildOrganizerGridModel: rows none with columns order", () => {
  it("returns one sequence in tree order", () => {
    const m = buildOrganizerGridModel({
      cards: [card("b"), card("a"), card("c")],
      rows: noAxis,
      columns: orderAxis,
      cap: null,
    });
    expect(m.isSingleSequence).toBe(true);
    expect(m.cells).toHaveLength(1);
    expect(cellIds(m, "all", "order")).toEqual(["b", "a", "c"]);
  });

  it("is not a single sequence once rows are a field", () => {
    const m = buildOrganizerGridModel({
      cards: [card("a")],
      rows: fieldAxis({ kind: "status" }, ["d"], {}),
      columns: orderAxis,
      cap: null,
    });
    expect(m.isSingleSequence).toBe(false);
  });
});

describe("buildOrganizerPhoneGroups", () => {
  const cards = [card("a"), card("b"), card("c")];
  const model = buildOrganizerGridModel({
    cards,
    rows: fieldAxis({ kind: "status" }, ["draft", "done", "empty"], {
      a: "draft",
      b: "draft",
      c: "mystery",
    }),
    columns: fieldAxis({ kind: "field", key: "t" }, ["p", "q"], {
      a: ["p", "q"],
      b: "q",
    }),
    cap: null,
  });
  const groups = buildOrganizerPhoneGroups(model);

  it("has one group per row value, with empty groups, Other and None", () => {
    expect(groups.map((g) => g.rowKey)).toEqual([
      "draft",
      "done",
      "empty",
      "other",
      "none",
    ]);
    expect(groups.find((g) => g.rowKey === "empty")!.cards).toEqual([]);
  });

  it("lists every card and names the column value or values per card", () => {
    const draft = groups.find((g) => g.rowKey === "draft")!;
    expect(draft.cards.map((c) => c.cardId)).toEqual(["a", "b"]);
    expect(draft.cards[0].columnLabels).toEqual(["p", "q"]);
    expect(draft.cards[1].columnLabels).toEqual(["q"]);
    expect(
      groups.find((g) => g.rowKey === "other")!.cards[0].columnLabels,
    ).toEqual(["None"]);
    const ids = new Set(groups.flatMap((g) => g.cards.map((c) => c.cardId)));
    expect([...ids].sort()).toEqual(["a", "b", "c"]);
  });

  it("marks a card in several row groups as the same document", () => {
    const m = buildOrganizerGridModel({
      cards: [card("a")],
      rows: fieldAxis({ kind: "field", key: "t" }, ["p", "q"], {
        a: ["p", "q"],
      }),
      columns: orderAxis,
      cap: null,
    });
    const g = buildOrganizerPhoneGroups(m);
    expect(g[0].cards[0].appearance).toBe(0);
    expect(g[1].cards[0].appearance).toBe(1);
    expect(g[0].cards[0].alsoInOtherGroups).toBe(1);
  });

  it("gives one group holding every card and no labels for rows none", () => {
    const m = buildOrganizerGridModel({
      cards,
      rows: noAxis,
      columns: orderAxis,
      cap: null,
    });
    const g = buildOrganizerPhoneGroups(m);
    expect(g).toHaveLength(1);
    expect(g[0].cards.map((c) => c.cardId)).toEqual(["a", "b", "c"]);
    expect(g[0].cards.every((c) => c.columnLabels.length === 0)).toBe(true);
  });
});

describe("organizerGridModel imports", () => {
  it("imports no React, Redux or @dnd-kit", () => {
    const src = readFileSync(
      new URL(
        "../components/WorkArea/Views/OrganizerView/organizerGridModel.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const froms = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map(
      (x) => x[1],
    );
    expect(froms.length).toBeGreaterThan(0);
    for (const f of froms) {
      expect(f).not.toMatch(
        /^(react|react-dom|react-redux|redux|@reduxjs\/toolkit|@dnd-kit\/.*)$/,
      );
    }
  });
});
