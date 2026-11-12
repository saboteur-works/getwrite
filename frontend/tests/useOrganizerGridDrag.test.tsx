/** @vitest-environment jsdom */
/**
 * Feature 109, Task 20: the Organizer grid drag hook. jsdom has no layout,
 * so cell and card rects come from a mocked `getBoundingClientRect` that
 * reads a `data-rect` attribute (left,top,width,height). Nothing here is
 * evidence about touch or a real browser.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  renderHook,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import type { MetadataField } from "../src/lib/models/types";
import type { OrganizerAxisValueList } from "../src/lib/models/organizer-grid-types";
import type { OrganizerDropCard } from "../components/WorkArea/Views/OrganizerView/organizerDropModel";
import {
  cardDraggableId,
  cellDroppableId,
  parseCardDraggableId,
  parseCellDroppableId,
  useOrganizerGridDrag,
  type UseOrganizerGridDragOptions,
} from "../components/WorkArea/Views/OrganizerView/useOrganizerGridDrag";

const rows: OrganizerAxisValueList = {
  axis: { kind: "status" },
  values: [
    {
      key: "draft",
      kind: "value",
      label: "Draft",
      isDropTarget: true,
      value: "draft",
    },
    {
      key: "final",
      kind: "value",
      label: "Final",
      isDropTarget: true,
      value: "final",
    },
    { key: "other", kind: "other", label: "Other values", isDropTarget: false },
  ],
};
const columns: OrganizerAxisValueList = {
  axis: { kind: "field", key: "act" },
  values: ["One", "Two", "Three"].map((v) => ({
    key: v,
    kind: "value" as const,
    label: v,
    isDropTarget: true,
    value: v,
  })),
};
const orderColumns: OrganizerAxisValueList = { axis: "order", values: [] };
const actField = {
  key: "act",
  label: "Act",
  type: "select",
  options: ["One", "Two", "Three"],
} as MetadataField;

const cards: Record<string, OrganizerDropCard> = {
  A: {
    id: "A",
    kind: "resource",
    userMetadata: { status: "draft", act: "One" },
  },
  B: {
    id: "B",
    kind: "resource",
    userMetadata: { status: "draft", act: "Two" },
  },
  C: { id: "C", kind: "resource", userMetadata: { status: "draft" } },
};

function baseOptions(
  over: Partial<UseOrganizerGridDragOptions> = {},
): UseOrganizerGridDragOptions {
  return {
    rows,
    columns,
    fields: [actField],
    statuses: ["draft", "final"],
    subtypes: [],
    getCard: (id) => cards[id],
    getCardTitle: (id) => `Card ${id}`,
    orderDrop: {
      source: { kind: "folder", scope: "children" },
      filterActive: false,
      siblingIds: ["A", "B", "C"],
      getRowCardIds: () => ["A", "B", "C"],
    },
    onFieldDrop: vi.fn(),
    onOrderDrop: vi.fn(),
    onRefuse: vi.fn(),
    ...over,
  };
}

const rectAttr = (l: number, t: number): string => `${l},${t},100,100`;

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const raw = this.getAttribute("data-rect");
      if (!raw) return new DOMRect(0, 0, 0, 0);
      const [l, t, w, h] = raw.split(",").map(Number);
      return new DOMRect(l, t, w, h);
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Card(props: {
  cardId: string;
  rowKey: string;
  columnKey: string;
  rect: string;
}): React.ReactElement {
  const id = cardDraggableId(props.cardId, props.rowKey, props.columnKey);
  const drag = useDraggable({ id });
  const drop = useDroppable({ id });
  const { setActivatorNodeRef, attributes, listeners } = drag;
  const setNodeRef = (node: HTMLElement | null): void => {
    drag.setNodeRef(node);
    drop.setNodeRef(node);
  };
  return (
    <div
      ref={setNodeRef}
      data-rect={props.rect}
      data-organizer-card-id={props.cardId}
    >
      <button
        ref={setActivatorNodeRef}
        data-organizer-drag-handle=""
        {...attributes}
        {...listeners}
      >
        Drag {props.cardId}
      </button>
    </div>
  );
}
function Cell(props: {
  rowKey: string;
  columnKey: string;
  rect: string;
}): React.ReactElement {
  const { setNodeRef } = useDroppable({
    id: cellDroppableId(props.rowKey, props.columnKey),
  });
  return <div ref={setNodeRef} data-rect={props.rect} />;
}

function Harness(props: {
  options: UseOrganizerGridDragOptions;
  order?: boolean;
}): React.ReactElement {
  const drag = useOrganizerGridDrag(props.options);
  if (props.order) {
    return (
      <DndContext {...drag.dndContextProps}>
        {["A", "B", "C"].map((id, i) => (
          <Card
            key={id}
            cardId={id}
            rowKey="draft"
            columnKey="order"
            rect={rectAttr(0, i * 100)}
          />
        ))}
      </DndContext>
    );
  }
  const rowKeys = ["draft", "final", "other"];
  const colKeys = ["One", "Two", "Three"];
  return (
    <DndContext {...drag.dndContextProps}>
      {rowKeys.flatMap((r, ri) =>
        colKeys.map((c, ci) => (
          <Cell
            key={`${r}${c}`}
            rowKey={r}
            columnKey={c}
            rect={rectAttr(ci * 100, ri * 100)}
          />
        )),
      )}
      <Card cardId="A" rowKey="draft" columnKey="One" rect={rectAttr(0, 0)} />
      <Card cardId="B" rowKey="draft" columnKey="Two" rect={rectAttr(100, 0)} />
    </DndContext>
  );
}

const press = (el: Element, code: string): void => {
  fireEvent.keyDown(el, { code, key: code });
};

async function keyboardDrag(
  handleName: string,
  codes: string[],
): Promise<void> {
  const handle = screen.getByRole("button", { name: handleName });
  handle.focus();
  for (const code of codes) {
    press(handle, code);
    await new Promise((r) => setTimeout(r, 0));
  }
}

describe("id helpers", () => {
  it("round-trips keys that contain colons", () => {
    const id = cellDroppableId("a:b", "c:d:e");
    expect(parseCellDroppableId(id)).toEqual({
      rowKey: "a:b",
      columnKey: "c:d:e",
    });
    const card = cardDraggableId("id:1", "a:b", "c");
    expect(parseCardDraggableId(card)).toEqual({
      cardId: "id:1",
      rowKey: "a:b",
      columnKey: "c",
    });
    expect(parseCellDroppableId(card)).toBeNull();
    expect(parseCardDraggableId(id)).toBeNull();
  });
});

describe("sensors", () => {
  it("keeps the distance-8 pointer sensor and a keyboard sensor with the custom getter", () => {
    const { result } = renderHook(() => useOrganizerGridDrag(baseOptions()));
    const sensors = result.current.sensors as unknown as Array<{
      sensor: unknown;
      options: Record<string, unknown>;
    }>;
    const pointer = sensors.find((s) => s.sensor === PointerSensor);
    const keyboard = sensors.find((s) => s.sensor === KeyboardSensor);
    expect(pointer?.options).toEqual({ activationConstraint: { distance: 8 } });
    expect(typeof keyboard?.options.coordinateGetter).toBe("function");
  });
});

describe("keyboard drag over cells (field mode)", () => {
  it("lifts with Space, moves with arrows and a drop passes the model payload to onFieldDrop", async () => {
    const options = baseOptions();
    render(<Harness options={options} />);
    await keyboardDrag("Drag A", [
      "Space",
      "ArrowRight",
      "ArrowRight",
      "ArrowDown",
      "Space",
    ]);
    await waitFor(() => expect(options.onFieldDrop).toHaveBeenCalledTimes(1));
    const [input, ctx] = vi.mocked(options.onFieldDrop).mock.calls[0];
    expect(input).toEqual({
      resourceId: "A",
      changes: [
        { target: { kind: "status" }, op: "set", value: "final" },
        { target: { kind: "field", key: "act" }, op: "set", value: "Three" },
      ],
    });
    expect(ctx.to).toEqual({ rowKey: "final", columnKey: "Three" });
    expect(ctx.cellLabel).toBe("row Final, column Three");
    expect(options.onOrderDrop).not.toHaveBeenCalled();
    expect(options.onRefuse).not.toHaveBeenCalled();
  });

  it("moves onto an occupied cell", async () => {
    const options = baseOptions();
    render(<Harness options={options} />);
    await keyboardDrag("Drag A", ["Space", "ArrowRight", "Space"]);
    await waitFor(() => expect(options.onFieldDrop).toHaveBeenCalledTimes(1));
    expect(vi.mocked(options.onFieldDrop).mock.calls[0][0].changes).toEqual([
      { target: { kind: "field", key: "act" }, op: "set", value: "Two" },
    ]);
  });

  it("Escape cancels inside dnd-kit: no callback fires", async () => {
    const options = baseOptions();
    render(<Harness options={options} />);
    await keyboardDrag("Drag A", [
      "Space",
      "ArrowRight",
      "ArrowDown",
      "Escape",
    ]);
    await new Promise((r) => setTimeout(r, 10));
    expect(options.onFieldDrop).not.toHaveBeenCalled();
    expect(options.onOrderDrop).not.toHaveBeenCalled();
    expect(options.onRefuse).not.toHaveBeenCalled();
  });

  it("a drop on the card's own cell is a no-op", async () => {
    const options = baseOptions();
    render(<Harness options={options} />);
    await keyboardDrag("Drag A", ["Space", "Space"]);
    await new Promise((r) => setTimeout(r, 10));
    expect(options.onFieldDrop).not.toHaveBeenCalled();
    expect(options.onRefuse).not.toHaveBeenCalled();
  });

  it("a drop on Other values goes to onRefuse with the model text and no write", async () => {
    const options = baseOptions();
    render(<Harness options={options} />);
    await keyboardDrag("Drag A", ["Space", "ArrowDown", "ArrowDown", "Space"]);
    await waitFor(() => expect(options.onRefuse).toHaveBeenCalledTimes(1));
    expect(options.onRefuse).toHaveBeenCalledWith(
      "That row or column is not a value this field allows.",
    );
    expect(options.onFieldDrop).not.toHaveBeenCalled();
  });

  it("returns focus to the moved card after a drop and after a refusal", async () => {
    const options = baseOptions();
    render(<Harness options={options} />);
    const a = screen.getByRole("button", { name: "Drag A" });
    const b = screen.getByRole("button", { name: "Drag B" });
    await keyboardDrag("Drag A", ["Space", "ArrowRight"]);
    b.focus();
    press(a, "Space");
    await waitFor(() => expect(options.onFieldDrop).toHaveBeenCalled());
    await waitFor(() => expect(document.activeElement).toBe(a));
    await keyboardDrag("Drag A", ["Space", "ArrowDown", "ArrowDown"]);
    b.focus();
    press(a, "Space");
    await waitFor(() => expect(options.onRefuse).toHaveBeenCalled());
    await waitFor(() => expect(document.activeElement).toBe(a));
  });

  it("uses an injected focusCard when given", async () => {
    const focusCard = vi.fn();
    const options = baseOptions({ focusCard });
    render(<Harness options={options} />);
    await keyboardDrag("Drag A", ["Space", "ArrowRight", "Space"]);
    await waitFor(() => expect(focusCard).toHaveBeenCalledWith("A"));
  });

  it("exposes the dragged card id while a drag is active and clears it after", async () => {
    const seen: Array<string | null> = [];
    function Probe(): React.ReactElement {
      const drag = useOrganizerGridDrag(baseOptions());
      seen.push(drag.activeCardId);
      return (
        <DndContext {...drag.dndContextProps}>
          <Cell rowKey="draft" columnKey="One" rect={rectAttr(0, 0)} />
          <Card
            cardId="A"
            rowKey="draft"
            columnKey="One"
            rect={rectAttr(0, 0)}
          />
        </DndContext>
      );
    }
    render(<Probe />);
    await keyboardDrag("Drag A", ["Space"]);
    await waitFor(() => expect(seen).toContain("A"));
    press(screen.getByRole("button", { name: "Drag A" }), "Escape");
    await waitFor(() => expect(seen[seen.length - 1]).toBeNull());
  });
});

/**
 * Cells of different heights with a card smaller than its cell, as in the real
 * grid (the card sits at the top of a tall cell). One arrow press must reach
 * the adjacent cell in that direction (measured in a browser: 2 to 3 presses
 * before, because the card's own cell centre lay below the card's centre).
 */
describe("keyboard drag: one arrow press is one cell", () => {
  const ROW_KEYS = ["draft", "final", "other"];
  const COL_KEYS = ["One", "Two", "Three"];
  const ROW_TOPS = [0, 300, 400];
  const ROW_HEIGHTS = [300, 100, 60];
  const CELL_WIDTH = 200;

  function Sized(props: {
    options: UseOrganizerGridDragOptions;
    cardRow: number;
    cardCol: number;
  }): React.ReactElement {
    const drag = useOrganizerGridDrag(props.options);
    return (
      <DndContext {...drag.dndContextProps}>
        {ROW_KEYS.flatMap((r, ri) =>
          COL_KEYS.map((c, ci) => (
            <Cell
              key={`${r}${c}`}
              rowKey={r}
              columnKey={c}
              rect={`${ci * CELL_WIDTH},${ROW_TOPS[ri]},${CELL_WIDTH},${ROW_HEIGHTS[ri]}`}
            />
          )),
        )}
        <Card
          cardId="A"
          rowKey={ROW_KEYS[props.cardRow]}
          columnKey={COL_KEYS[props.cardCol]}
          rect={`${props.cardCol * CELL_WIDTH + 10},${ROW_TOPS[props.cardRow] + 10},180,40`}
        />
      </DndContext>
    );
  }

  async function dropAfter(
    codes: string[],
    from: [number, number],
  ): Promise<{ rowKey: string; columnKey: string } | "own-cell"> {
    const options = baseOptions({
      // A card with no stored value, so a drop never reads as already there.
      getCard: () => ({ id: "A", kind: "resource", userMetadata: {} }),
    });
    render(<Sized options={options} cardRow={from[0]} cardCol={from[1]} />);
    await keyboardDrag("Drag A", ["Space", ...codes, "Space"]);
    await new Promise((r) => setTimeout(r, 20));
    const calls = vi.mocked(options.onFieldDrop).mock.calls;
    const refused = vi.mocked(options.onRefuse).mock.calls;
    if (calls.length === 1) return calls[0][1].to;
    if (refused.length === 1) {
      // "Other values" is a refusing target: its coordinates are the answer.
      return { rowKey: "other", columnKey: COL_KEYS[from[1]] };
    }
    return "own-cell";
  }

  it("ArrowDown from the first row reaches the next row, not its own cell", async () => {
    expect(await dropAfter(["ArrowDown"], [0, 0])).toEqual({
      rowKey: "final",
      columnKey: "One",
    });
  });

  it("ArrowDown twice reaches the third row (an empty, refusing cell)", async () => {
    expect(await dropAfter(["ArrowDown", "ArrowDown"], [0, 1])).toEqual({
      rowKey: "other",
      columnKey: "Two",
    });
  });

  it("ArrowRight reaches the next column, ArrowLeft the previous one", async () => {
    expect(await dropAfter(["ArrowRight"], [0, 0])).toEqual({
      rowKey: "draft",
      columnKey: "Two",
    });
    cleanup();
    expect(await dropAfter(["ArrowLeft"], [0, 2])).toEqual({
      rowKey: "draft",
      columnKey: "Two",
    });
  });

  it("ArrowUp from the second row reaches the first row", async () => {
    expect(await dropAfter(["ArrowUp"], [1, 2])).toEqual({
      rowKey: "draft",
      columnKey: "Three",
    });
  });

  it("an arrow with no cell that way does not move the card", async () => {
    expect(await dropAfter(["ArrowUp"], [0, 0])).toBe("own-cell");
    cleanup();
    expect(await dropAfter(["ArrowLeft"], [0, 0])).toBe("own-cell");
  });
});

describe("keyboard drag in order mode", () => {
  const orderOptions = (
    over: Partial<UseOrganizerGridDragOptions> = {},
  ): UseOrganizerGridDragOptions =>
    baseOptions({ columns: orderColumns, ...over });

  it("a drop on another card in the row calls onOrderDrop with the new sibling order", async () => {
    const options = orderOptions();
    render(<Harness options={options} order />);
    await keyboardDrag("Drag A", ["Space", "ArrowDown", "Space"]);
    await waitFor(() => expect(options.onOrderDrop).toHaveBeenCalledTimes(1));
    expect(options.onOrderDrop).toHaveBeenCalledWith(["B", "A", "C"]);
    expect(options.onFieldDrop).not.toHaveBeenCalled();
  });

  it("a drop on a card in another row is refused with the model text", async () => {
    const options = orderOptions();
    function Two(): React.ReactElement {
      const drag = useOrganizerGridDrag(options);
      return (
        <DndContext {...drag.dndContextProps}>
          <Card
            cardId="A"
            rowKey="draft"
            columnKey="order"
            rect={rectAttr(0, 0)}
          />
          <Card
            cardId="Z"
            rowKey="final"
            columnKey="order"
            rect={rectAttr(0, 100)}
          />
        </DndContext>
      );
    }
    render(<Two />);
    await keyboardDrag("Drag A", ["Space", "ArrowDown", "Space"]);
    await waitFor(() => expect(options.onRefuse).toHaveBeenCalledTimes(1));
    expect(options.onRefuse).toHaveBeenCalledWith(
      "Use a field drag to change a card's row. Dropping on order only reorders within a row.",
    );
    expect(options.onOrderDrop).not.toHaveBeenCalled();
  });

  it("an active filter refuses an order drop", async () => {
    const options = orderOptions({
      orderDrop: {
        source: { kind: "folder", scope: "children" },
        filterActive: true,
        siblingIds: ["A", "B", "C"],
        getRowCardIds: () => ["A", "B", "C"],
      },
    });
    render(<Harness options={options} order />);
    await keyboardDrag("Drag A", ["Space", "ArrowDown", "Space"]);
    await waitFor(() =>
      expect(options.onRefuse).toHaveBeenCalledWith(
        "Clear filters to reorder cards",
      ),
    );
  });
});

describe("announcements", () => {
  const announcements = (
    over: Partial<UseOrganizerGridDragOptions> = {},
  ): NonNullable<
    ReturnType<
      typeof useOrganizerGridDrag
    >["dndContextProps"]["accessibility"]["announcements"]
  > =>
    renderHook(() => useOrganizerGridDrag(baseOptions(over))).result.current
      .dndContextProps.accessibility.announcements;
  const activeId = cardDraggableId("A", "draft", "One");
  type Evt = Parameters<ReturnType<typeof announcements>["onDragEnd"]>[0];
  const evt = (overId: string | null): Evt =>
    ({
      active: { id: activeId },
      over: overId === null ? null : { id: overId },
    }) as unknown as Evt;
  const cell = (r: string, c: string): string => cellDroppableId(r, c);

  it("names the pick-up and the target cell by its row and column names", () => {
    const a = announcements();
    expect(a.onDragStart(evt(null))).toContain("Picked up Card A");
    expect(a.onDragOver(evt(cell("final", "Three")))).toBe(
      "Card A is over row Final, column Three.",
    );
    expect(a.onDragOver(evt(null))).toBe("Card A is not over a cell.");
  });

  it("names the drop, the cancel and a no-change drop", () => {
    const a = announcements();
    expect(a.onDragEnd(evt(cell("final", "Three")))).toBe(
      "Card A dropped on row Final, column Three.",
    );
    expect(a.onDragEnd(evt(cell("draft", "One")))).toBe(
      "Card A dropped in its own cell. No change.",
    );
    expect(a.onDragEnd(evt(null))).toBe(
      "Card A dropped outside the cells. No change.",
    );
    expect(a.onDragCancel(evt(null))).toBe(
      "Move of Card A cancelled. No change.",
    );
  });

  it("announces every refusal with its text", () => {
    const a = announcements();
    expect(a.onDragEnd(evt(cell("other", "One")))).toBe(
      "Card A was not moved. That row or column is not a value this field allows.",
    );
  });

  it("reaches the live region during a real keyboard drag (the pick-up text is replaced at once by the over text)", async () => {
    render(<Harness options={baseOptions()} />);
    await keyboardDrag("Drag A", ["Space"]);
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "Card A is over row Draft, column One.",
      ),
    );
  });
});
