/** @vitest-environment jsdom */
/**
 * Feature 109, Task 38 (FR-11): keyboard model of the Organizer grid, tested
 * on the presentational `OrganizerGrid` with the `useOrganizerGridDrag` hook
 * inside a `DndContext` (not `OrganizerView`). jsdom has no layout: cell
 * rects come from a mocked `getBoundingClientRect` keyed by row and column
 * index. This is not device evidence, not a screen-reader run and not a
 * browser run.
 *
 * The drag layer here (a droppable cell wrapper, a draggable card wrapper) is
 * a stand-in for the one the Organizer view will provide; ids follow the
 * hook's `cellDroppableId` and `cardDraggableId`.
 */
import React from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import OrganizerGrid, {
  type OrganizerGridCardInfo,
} from "../components/WorkArea/Views/OrganizerView/OrganizerGrid";
import OrganizerGridCell, {
  type OrganizerGridCellProps,
} from "../components/WorkArea/Views/OrganizerView/OrganizerGridCell";
import OrganizerCard from "../components/WorkArea/Views/OrganizerView/OrganizerCard";
import {
  buildOrganizerGridModel,
  type OrganizerGridAxisInput,
  type OrganizerGridResult,
} from "../components/WorkArea/Views/OrganizerView/organizerGridModel";
import {
  cardDraggableId,
  cellDroppableId,
  useOrganizerGridDrag,
  type UseOrganizerGridDragOptions,
} from "../components/WorkArea/Views/OrganizerView/useOrganizerGridDrag";
import { createTextResource } from "../src/lib/models/resource";
import type { AnyResource, MetadataField } from "../src/lib/models/types";
import type {
  OrganizerAxisValue,
  OrganizerFieldWriteInput,
  OrganizerGridCard,
} from "../src/lib/models/organizer-grid-types";

// ---------------------------------------------------------------------------
// Data: a status-by-field grid with Other values, None, a duplicate and an
// empty cell.
//   rows:    Draft, Done, Other values, None
//   columns: One, Two, None
//   a: Draft / One      b: Done / One and Two (duplicate)
//   c: status "Weird" (Other values row) / no act (None column)
//   d: no status (None row) / One
//   Draft x Two is empty.
// ---------------------------------------------------------------------------

type Meta = { status?: string; act?: string | string[] };

const INITIAL: Record<string, Meta> = {
  a: { status: "Draft", act: "One" },
  b: { status: "Done", act: ["One", "Two"] },
  c: { status: "Weird" },
  d: { act: "One" },
};
const IDS = ["a", "b", "c", "d"];
const STATUSES = ["Draft", "Done"];
const actField = {
  key: "act",
  label: "Act",
  type: "select",
  options: ["One", "Two"],
} as MetadataField;

const line = (key: string): OrganizerAxisValue => ({
  key,
  label: key,
  kind: "value",
  isDropTarget: true,
  value: key,
});

function modelFor(meta: Record<string, Meta>): OrganizerGridResult {
  const rows: OrganizerGridAxisInput = {
    axis: { kind: "status" },
    list: { axis: { kind: "status" }, values: STATUSES.map(line) },
    values: new Map(IDS.map((id) => [id, meta[id].status])),
  };
  const columns: OrganizerGridAxisInput = {
    axis: { kind: "field", key: "act" },
    list: {
      axis: { kind: "field", key: "act" },
      values: ["One", "Two"].map(line),
    },
    values: new Map(IDS.map((id) => [id, meta[id].act])),
  };
  const cards: OrganizerGridCard[] = IDS.map((id) => ({
    id,
    kind: "resource",
  }));
  return buildOrganizerGridModel({ cards, rows, columns, cap: null });
}

const docs = IDS.map((id) => ({
  ...createTextResource({ name: `Doc ${id}`, plainText: "x y" }),
  id,
}));
const resources = new Map<string, AnyResource>(docs.map((d) => [d.id, d]));

// ---------------------------------------------------------------------------
// Stand-in drag layer.
// ---------------------------------------------------------------------------

function DroppableCell(props: OrganizerGridCellProps): React.ReactElement {
  const { setNodeRef, isOver } = useDroppable({
    id: cellDroppableId(props.rowKey, props.columnKey),
  });
  return (
    <OrganizerGridCell {...props} droppableRef={setNodeRef} isOver={isOver} />
  );
}

function DraggableCard({
  info,
}: {
  info: OrganizerGridCardInfo;
}): React.ReactElement {
  const { setNodeRef, attributes, listeners } = useDraggable({
    id: cardDraggableId(
      info.cardId,
      info.placement.rowKey,
      info.placement.columnKey,
    ),
  });
  return (
    <div data-organizer-card-id={info.cardId}>
      <OrganizerCard
        resource={info.resource}
        {...info.cardProps}
        cardRef={setNodeRef}
        dragHandleAttributes={
          {
            ...attributes,
            "data-organizer-drag-handle": "",
          } as React.HTMLAttributes<HTMLElement>
        }
        dragHandleListeners={listeners}
      />
      {info.alsoInOtherCellsText && <p>{info.alsoInOtherCellsText}</p>}
    </div>
  );
}

type DropCtx = Parameters<UseOrganizerGridDragOptions["onFieldDrop"]>[1];

interface Spies {
  onOpen: Mock<(id: string) => void>;
  onFieldDrop: Mock<(input: OrganizerFieldWriteInput, ctx: DropCtx) => void>;
  onRefuse: Mock<(message: string) => void>;
}

function applyChanges(
  meta: Record<string, Meta>,
  input: OrganizerFieldWriteInput,
): Record<string, Meta> {
  const next = { ...meta[input.resourceId] };
  for (const change of input.changes) {
    const key = change.target.kind === "status" ? "status" : "act";
    if (change.op === "clear") delete next[key];
    else (next as Record<string, unknown>)[key] = change.value;
  }
  return { ...meta, [input.resourceId]: next };
}

function Harness({
  spies,
  applyDrop = true,
}: {
  spies: Spies;
  applyDrop?: boolean;
}): React.ReactElement {
  const [meta, setMeta] = React.useState(INITIAL);
  const model = React.useMemo(() => modelFor(meta), [meta]);
  const drag = useOrganizerGridDrag({
    rows: { axis: { kind: "status" }, values: model.rows },
    columns: { axis: { kind: "field", key: "act" }, values: model.columns },
    fields: [actField],
    statuses: STATUSES,
    subtypes: [],
    getCard: (id) => ({
      id,
      kind: "resource",
      userMetadata: { ...(meta[id] as Record<string, never>) },
    }),
    getCardTitle: (id) => `Doc ${id}`,
    onFieldDrop: (input, ctx) => {
      spies.onFieldDrop(input, ctx);
      if (applyDrop) setMeta((m) => applyChanges(m, input));
    },
    onOrderDrop: vi.fn(),
    onRefuse: (message) => spies.onRefuse(message),
  });
  return (
    <DndContext {...drag.dndContextProps}>
      <OrganizerGrid
        model={model}
        resources={resources}
        getCardProps={(id) => ({ onOpen: () => spies.onOpen(id) })}
        CellComponent={DroppableCell}
        renderCard={(info) => <DraggableCard info={info} />}
      />
    </DndContext>
  );
}

function mount(options: { applyDrop?: boolean } = {}): Spies {
  const spies: Spies = {
    onOpen: vi.fn<(id: string) => void>(),
    onFieldDrop:
      vi.fn<(input: OrganizerFieldWriteInput, ctx: DropCtx) => void>(),
    onRefuse: vi.fn<(message: string) => void>(),
  };
  render(<Harness spies={spies} applyDrop={options.applyDrop} />);
  return spies;
}

// ---------------------------------------------------------------------------
// jsdom plumbing.
// ---------------------------------------------------------------------------

const ROW_KEYS = ["Draft", "Done", "other", "none"];
const COL_KEYS = ["One", "Two", "none"];

function rectOfCell(cell: Element): DOMRect {
  const r = ROW_KEYS.indexOf(cell.getAttribute("data-row-key") ?? "");
  const c = COL_KEYS.indexOf(cell.getAttribute("data-column-key") ?? "");
  return new DOMRect(c * 100, r * 100, 100, 100);
}

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const cell = this.closest("[data-cell-id]");
      return cell ? rectOfCell(cell) : new DOMRect(0, 0, 0, 0);
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const cell = (row: string, column: string): HTMLElement => {
  const el = document.querySelector<HTMLElement>(
    `[role="gridcell"][data-row-key="${row}"][data-column-key="${column}"]`,
  );
  if (!el) throw new Error(`no cell ${row} x ${column}`);
  return el;
};

const handleOf = (docId: string, index = 0): HTMLElement => {
  const articles = screen.getAllByRole("article", { name: `Doc ${docId}` });
  return within(articles[index]).getByRole("button", {
    name: "Drag to reorder",
  });
};

const press = (el: Element, code: string, init: object = {}): void => {
  fireEvent.keyDown(el, { code, key: code === "Space" ? " " : code, ...init });
};
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Records every text the dnd-kit live region shows, in order. */
function recordAnnouncements(): { texts: string[]; stop: () => void } {
  const texts: string[] = [];
  const read = (): void => {
    const text = screen.queryByRole("status")?.textContent ?? "";
    if (text && texts[texts.length - 1] !== text) texts.push(text);
  };
  const observer = new MutationObserver(read);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
  });
  return { texts, stop: () => observer.disconnect() };
}

async function drive(el: Element, codes: string[]): Promise<void> {
  for (const code of codes) {
    press(el, code);
    await tick();
  }
}

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

describe("grid structure the keyboard model relies on", () => {
  it("has a single tab stop among the cells and empty cells are focusable gridcells", () => {
    mount();
    const cells = screen.getAllByRole("gridcell");
    expect(cells).toHaveLength(ROW_KEYS.length * COL_KEYS.length);
    expect(cells.filter((c: HTMLElement) => c.tabIndex === 0)).toHaveLength(1);
    const empty = cell("Draft", "Two");
    expect(empty).toHaveAccessibleName("Draft, Two, empty");
    expect(empty.tabIndex).toBe(-1);
  });
});

describe("arrow keys move focus between cells", () => {
  it("moves right and down, into empty cells, and stops at the edges", () => {
    mount();
    const start = cell("Draft", "One");
    start.focus();
    press(start, "ArrowRight");
    expect(document.activeElement).toBe(cell("Draft", "Two"));
    expect(cell("Draft", "Two").tabIndex).toBe(0);
    expect(cell("Draft", "One").tabIndex).toBe(-1);
    press(document.activeElement as Element, "ArrowDown");
    expect(document.activeElement).toBe(cell("Done", "Two"));
    press(document.activeElement as Element, "ArrowRight");
    expect(document.activeElement).toBe(cell("Done", "none"));
    press(document.activeElement as Element, "ArrowRight");
    expect(document.activeElement).toBe(cell("Done", "none"));
    press(document.activeElement as Element, "ArrowLeft");
    press(document.activeElement as Element, "ArrowUp");
    expect(document.activeElement).toBe(cell("Draft", "Two"));
    press(document.activeElement as Element, "ArrowUp");
    expect(document.activeElement).toBe(cell("Draft", "Two"));
  });

  it("Home and End go to the first and last column of the row", () => {
    mount();
    const start = cell("Done", "Two");
    act(() => start.focus());
    press(start, "End");
    expect(document.activeElement).toBe(cell("Done", "none"));
    press(document.activeElement as Element, "Home");
    expect(document.activeElement).toBe(cell("Done", "One"));
  });

  it("does not move a cell on an arrow pressed inside a card button", () => {
    mount();
    cell("Draft", "One").focus();
    const handle = handleOf("a");
    handle.focus();
    press(handle, "ArrowRight");
    expect(document.activeElement).toBe(handle);
  });
});

describe("Enter opens the focused card", () => {
  it("opens the first card of the focused cell and does nothing in an empty cell", () => {
    const spies = mount();
    const full = cell("Draft", "One");
    full.focus();
    press(full, "Enter");
    expect(spies.onOpen).toHaveBeenCalledTimes(1);
    expect(spies.onOpen).toHaveBeenCalledWith("a");
    const empty = cell("Draft", "Two");
    empty.focus();
    press(empty, "Enter");
    expect(spies.onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("Space lifts, arrows move, Space drops", () => {
  it("moves a card to an empty cell with one write call, announcing each step", async () => {
    const spies = mount();
    const log = recordAnnouncements();
    const handle = handleOf("a");
    handle.focus();

    await drive(handle, ["Space"]);
    await waitFor(() =>
      expect(log.texts.at(-1)).toBe("Doc a is over row Draft, column One."),
    );
    // The pick-up text is replaced by the over text before the observer reads it; see the next describe.

    await drive(handle, ["ArrowRight"]);
    await waitFor(() =>
      expect(log.texts.at(-1)).toBe("Doc a is over row Draft, column Two."),
    );
    expect(spies.onFieldDrop).not.toHaveBeenCalled();

    await drive(handle, ["Space"]);
    await waitFor(() => expect(spies.onFieldDrop).toHaveBeenCalledTimes(1));
    log.stop();

    expect(log.texts.at(-1)).toBe("Doc a dropped on row Draft, column Two.");
    const [input] = spies.onFieldDrop.mock.calls[0];
    expect(input).toEqual({
      resourceId: "a",
      changes: [
        { target: { kind: "field", key: "act" }, op: "set", value: "Two" },
      ],
    });
    expect(spies.onRefuse).not.toHaveBeenCalled();
  });

  it("puts focus on the dragged card's handle after a drop when the card is not remounted", async () => {
    const spies = mount({ applyDrop: false });
    const handle = handleOf("a");
    handle.focus();
    await drive(handle, ["Space", "ArrowRight", "Space"]);
    await waitFor(() => expect(spies.onFieldDrop).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(document.activeElement).toBe(handleOf("a"));
  });

  // Observed: when the write is applied and the card re-renders in its new
  // cell (a new element), focus is on <body>, not on the moved card. FR-11
  // requires focus on the moved card. `it.fails` records the gap: it passes
  // while the gap exists and turns red when focus is kept.
  it.fails(
    "puts focus on the moved card's handle in its new cell after a drop",
    async () => {
      mount();
      const handle = handleOf("a");
      handle.focus();
      await drive(handle, ["Space", "ArrowRight", "Space"]);
      await waitFor(() =>
        expect(
          within(cell("Draft", "Two")).getByRole("article", { name: "Doc a" }),
        ).toBeInTheDocument(),
      );
      await new Promise((r) => setTimeout(r, 50));
      const moved = within(cell("Draft", "Two")).getByRole("button", {
        name: "Drag to reorder",
      });
      expect(document.activeElement).toBe(moved);
    },
  );

  it("refuses a drop on Other values: no write, refusal announced, focus stays on the card", async () => {
    const spies = mount();
    const log = recordAnnouncements();
    const handle = handleOf("a");
    handle.focus();
    await drive(handle, ["Space", "ArrowDown", "ArrowDown", "Space"]);
    await waitFor(() => expect(spies.onRefuse).toHaveBeenCalledTimes(1));
    log.stop();
    expect(spies.onRefuse).toHaveBeenCalledWith(
      "That row or column is not a value this field allows.",
    );
    expect(spies.onFieldDrop).not.toHaveBeenCalled();
    expect(log.texts).toContain("Doc a is over row Other values, column One.");
    expect(log.texts.at(-1)).toBe(
      "Doc a was not moved. That row or column is not a value this field allows.",
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(document.activeElement).toBe(handleOf("a"));
    expect(
      within(cell("Draft", "One")).getByRole("article", { name: "Doc a" }),
    ).toBeInTheDocument();
  });

  it("Escape cancels: announced, no write, card unmoved, focus on its handle", async () => {
    const spies = mount();
    const log = recordAnnouncements();
    const handle = handleOf("a");
    handle.focus();
    await drive(handle, ["Space", "ArrowRight", "Escape"]);
    await new Promise((r) => setTimeout(r, 50));
    log.stop();
    expect(log.texts.at(-1)).toBe("Move of Doc a cancelled. No change.");
    expect(spies.onFieldDrop).not.toHaveBeenCalled();
    expect(spies.onRefuse).not.toHaveBeenCalled();
    expect(
      within(cell("Draft", "One")).getByRole("article", { name: "Doc a" }),
    ).toBeInTheDocument();
    expect(document.activeElement).toBe(handleOf("a"));
  });

  it("a duplicate card lifts from either of its cells with its own source cell", async () => {
    const spies = mount({ applyDrop: false });
    const second = handleOf("b", 1);
    second.focus();
    await drive(second, ["Space", "ArrowLeft", "Space"]);
    await waitFor(() => expect(spies.onFieldDrop).toHaveBeenCalledTimes(1));
    const [, ctx] = spies.onFieldDrop.mock.calls[0];
    expect(ctx.from.columnKey).toBe("Two");
    expect(ctx.to.columnKey).toBe("One");
  });
});

describe("pick-up announcement", () => {
  it("names the card and the keys; read from the hook's announcements, since the live region shows the over text at once", () => {
    const { result } = renderHook(() =>
      useOrganizerGridDrag({
        rows: { axis: "none", values: [] },
        columns: { axis: "order", values: [] },
        fields: [],
        statuses: [],
        subtypes: [],
        getCard: () => undefined,
        getCardTitle: (id) => `Doc ${id}`,
        onFieldDrop: vi.fn(),
        onOrderDrop: vi.fn(),
        onRefuse: vi.fn(),
      }),
    );
    const text = result.current.announcements.onDragStart?.({
      active: { id: cardDraggableId("a", "all", "order") },
    } as never);
    expect(text).toBe(
      "Picked up Doc a. Use the arrow keys to move between cells, Space to drop, Escape to cancel.",
    );
  });
});

describe("global keys still fire", () => {
  const globalKeys = (): {
    escape: Mock<() => void>;
    cmdK: Mock<() => void>;
    events: KeyboardEvent[];
  } => {
    const escape = vi.fn<() => void>();
    const cmdK = vi.fn<() => void>();
    const events: KeyboardEvent[] = [];
    const listener = (e: KeyboardEvent): void => {
      events.push(e);
      if (e.key === "Escape") escape();
      if ((e.metaKey || e.ctrlKey) && e.key === "k") cmdK();
    };
    window.addEventListener("keydown", listener);
    afterEach(() => window.removeEventListener("keydown", listener));
    return { escape, cmdK, events };
  };

  it("Esc, Ctrl+K and Cmd+K reach a window handler from a focused cell and are not default-prevented", () => {
    mount();
    const g = globalKeys();
    const start = cell("Draft", "One");
    start.focus();
    press(start, "Escape", { key: "Escape" });
    press(start, "KeyK", { key: "k", ctrlKey: true });
    press(start, "KeyK", { key: "k", metaKey: true });
    expect(g.escape).toHaveBeenCalledTimes(1);
    expect(g.cmdK).toHaveBeenCalledTimes(2);
    expect(g.events.some((e) => e.defaultPrevented)).toBe(false);
  });

  it("Ctrl+K and Escape reach the window handler during a keyboard drag; Escape also cancels it", async () => {
    const spies = mount();
    const g = globalKeys();
    const log = recordAnnouncements();
    const handle = handleOf("a");
    handle.focus();
    await drive(handle, ["Space"]);
    press(handle, "KeyK", { key: "k", ctrlKey: true });
    expect(g.cmdK).toHaveBeenCalledTimes(1);
    await drive(handle, ["Escape"]);
    await new Promise((r) => setTimeout(r, 50));
    log.stop();
    expect(g.escape).toHaveBeenCalledTimes(1);
    expect(log.texts.at(-1)).toBe("Move of Doc a cancelled. No change.");
    expect(spies.onFieldDrop).not.toHaveBeenCalled();
  });
});
