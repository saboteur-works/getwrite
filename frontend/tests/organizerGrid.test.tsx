import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrganizerGrid from "../components/WorkArea/Views/OrganizerView/OrganizerGrid";
import OrganizerGridCell, {
  organizerCellId,
  organizerPlacementId,
  type OrganizerGridCellProps,
} from "../components/WorkArea/Views/OrganizerView/OrganizerGridCell";
import {
  buildOrganizerGridModel,
  type OrganizerGridAxisInput,
} from "../components/WorkArea/Views/OrganizerView/organizerGridModel";
import { createTextResource } from "../src/lib/models/resource";
import type { AnyResource, MetadataValue } from "../src/lib/models/types";
import type {
  OrganizerAxis,
  OrganizerAxisValue,
  OrganizerGridCard,
} from "../src/lib/models/organizer-grid-types";

const line = (key: string): OrganizerAxisValue => ({
  key,
  label: key,
  kind: "value",
  isDropTarget: true,
  value: key,
});
const field = (
  axis: OrganizerAxis,
  keys: string[],
  values: Record<string, MetadataValue | undefined>,
): OrganizerGridAxisInput => ({
  axis,
  list: { axis, values: keys.map(line) },
  values: new Map(Object.entries(values)),
});
const none: OrganizerGridAxisInput = {
  axis: "none",
  list: null,
  values: new Map(),
};
const order: OrganizerGridAxisInput = {
  axis: "order",
  list: null,
  values: new Map(),
};

const docs = ["a", "b", "c"].map((id) => ({
  ...createTextResource({ name: `Doc ${id}`, plainText: "x y" }),
  id,
}));
const resources = new Map<string, AnyResource>(docs.map((d) => [d.id, d]));
const cards: OrganizerGridCard[] = docs.map((d) => ({
  id: d.id,
  kind: "resource",
}));

function model(rows: OrganizerGridAxisInput, columns: OrganizerGridAxisInput) {
  return buildOrganizerGridModel({ cards, rows, columns, cap: null });
}

const statusRows = field({ kind: "status" }, ["Draft", "Done"], {
  a: "Draft",
  b: "Done",
  c: "Weird",
});
const tagCols = field({ kind: "field", key: "tags" }, ["x", "y"], {
  a: ["x", "y"],
  b: "x",
});
const noProps = (): Record<string, never> => ({});

describe("OrganizerGrid structure", () => {
  it("renders role grid with rows, column and row headers naming each value", () => {
    render(
      <OrganizerGrid
        model={model(statusRows, tagCols)}
        resources={resources}
        getCardProps={noProps}
      />,
    );
    const grid = screen.getByRole("grid");
    expect(within(grid).getAllByRole("row").length).toBe(1 + 4);
    const cols = within(grid)
      .getAllByRole("columnheader")
      .map((h: HTMLElement) => h.textContent);
    expect(cols).toEqual(expect.arrayContaining(["x", "y", "None"]));
    const rowsH = within(grid)
      .getAllByRole("rowheader")
      .map((h: HTMLElement) => h.textContent);
    expect(rowsH).toEqual(["Draft", "Done", "Other values", "None"]);
    expect(within(grid).getAllByRole("gridcell").length).toBe(4 * 3);
  });

  it("labels every cell with its row and column names", () => {
    render(
      <OrganizerGrid
        model={model(statusRows, tagCols)}
        resources={resources}
        getCardProps={noProps}
      />,
    );
    expect(screen.getByRole("gridcell", { name: /Draft, x/ })).toBeTruthy();
    expect(
      screen.getByRole("gridcell", { name: /None, None, empty/ }),
    ).toBeTruthy();
  });

  it("uses OrganizerCard unchanged: title, body, select and open", async () => {
    const onOpen = vi.fn();
    const onSelect = vi.fn();
    render(
      <OrganizerGrid
        model={model(none, order)}
        resources={resources}
        getCardProps={(id) => ({
          body: `body-${id}`,
          onOpen: () => onOpen(id),
          onSelect: () => onSelect(id),
        })}
      />,
    );
    expect(screen.getAllByRole("article").length).toBe(3);
    expect(screen.getByText("body-a")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Doc b" }));
    expect(onSelect).toHaveBeenCalledWith("b");
    await userEvent.click(screen.getAllByRole("button", { name: "Open" })[2]);
    expect(onOpen).toHaveBeenCalledWith("c");
  });

  it("shows also in N other cells for a duplicate card, and None and Other lines", () => {
    render(
      <OrganizerGrid
        model={model(none, tagCols)}
        resources={resources}
        getCardProps={noProps}
      />,
    );
    expect(screen.getAllByText(/also in 1 other cell/).length).toBe(2);
    expect(
      screen
        .getAllByRole("columnheader")
        .map((h: HTMLElement) => h.textContent),
    ).toEqual(expect.arrayContaining(["None"]));
  });

  it("with rows none and columns order, renders one cell with all cards", () => {
    render(
      <OrganizerGrid
        model={model(none, order)}
        resources={resources}
        getCardProps={noProps}
      />,
    );
    expect(screen.getAllByRole("gridcell").length).toBe(1);
  });

  it("uses theme tokens only: no hex colour in the markup", () => {
    const { container } = render(
      <OrganizerGrid
        model={model(statusRows, tagCols)}
        resources={resources}
        getCardProps={noProps}
      />,
    );
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("OrganizerGrid keyboard", () => {
  it("has one tab stop among cells (roving tabindex)", () => {
    render(
      <OrganizerGrid
        model={model(statusRows, tagCols)}
        resources={resources}
        getCardProps={noProps}
      />,
    );
    const cells = screen.getAllByRole("gridcell");
    expect(cells.filter((c: HTMLElement) => c.tabIndex === 0).length).toBe(1);
    expect(cells.filter((c: HTMLElement) => c.tabIndex === -1).length).toBe(11);
  });

  it("buttons inside non-active cells are out of tab order", () => {
    render(
      <OrganizerGrid
        model={model(statusRows, tagCols)}
        resources={resources}
        getCardProps={() => ({ onOpen: () => undefined })}
      />,
    );
    for (const cell of screen.getAllByRole("gridcell")) {
      if (cell.tabIndex === 0) continue;
      for (const b of within(cell).queryAllByRole("button")) {
        expect(b.tabIndex).toBe(-1);
      }
    }
  });

  it("arrow keys move between cells including empty ones, and stop at edges", async () => {
    render(
      <OrganizerGrid
        model={model(statusRows, tagCols)}
        resources={resources}
        getCardProps={noProps}
      />,
    );
    screen.getByRole("gridcell", { name: /Draft, x/ }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("gridcell", { name: /Draft, y/ })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(screen.getByRole("gridcell", { name: /Draft, None/ })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
    const last = screen.getByRole("gridcell", { name: /None, None/ });
    expect(last).toHaveFocus();
    expect(last.tabIndex).toBe(0);
    await userEvent.keyboard("{ArrowUp}");
    expect(
      screen.getByRole("gridcell", { name: /Other values, None/ }),
    ).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(
      screen.getByRole("gridcell", { name: /Other values, x/ }),
    ).toHaveFocus();
  });

  it("Enter on a focused cell opens its card; an empty cell opens nothing", async () => {
    const onOpen = vi.fn();
    render(
      <OrganizerGrid
        model={model(statusRows, tagCols)}
        resources={resources}
        getCardProps={(id) => ({ onOpen: () => onOpen(id) })}
      />,
    );
    screen.getByRole("gridcell", { name: /Done, x/ }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("b");
    screen.getByRole("gridcell", { name: /Done, y/ }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("OrganizerGrid drag wiring slots", () => {
  it("every cell is a droppable cell with an id; Other values is not a drop target", () => {
    const seen: OrganizerGridCellProps[] = [];
    const Slot = (props: OrganizerGridCellProps): JSX.Element => {
      seen.push(props);
      return <OrganizerGridCell {...props} />;
    };
    render(
      <OrganizerGrid
        model={model(statusRows, tagCols)}
        resources={resources}
        getCardProps={noProps}
        CellComponent={Slot}
      />,
    );
    expect(new Set(seen.map((p) => p.droppableId)).size).toBe(12);
    expect(seen[0].droppableId).toBe(organizerCellId("Draft", "x"));
    const other = seen.find((p) => p.rowKey === "other" && p.columnKey === "x");
    expect(other?.isDropTarget).toBe(false);
    const empty = seen.find((p) => p.rowKey === "Done" && p.columnKey === "y");
    expect(empty?.isDropTarget).toBe(true);
    expect(empty?.placements.length).toBe(0);
  });

  it("droppableRef and isOver reach the gridcell element", () => {
    const ref = vi.fn();
    render(
      <div role="grid" aria-label="t">
        <div role="row">
          <OrganizerGridCell
            rowKey="r"
            columnKey="c"
            rowLabel="R"
            columnLabel="C"
            droppableId={organizerCellId("r", "c")}
            isDropTarget
            isActive
            isOver
            droppableRef={ref}
            onFocusCell={() => undefined}
            placements={[]}
            renderPlacement={() => null}
          />
        </div>
      </div>,
    );
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLElement));
    expect(screen.getByRole("gridcell")).toHaveAttribute("data-over", "true");
  });

  it("renderCard receives a sortable id unique per appearance", () => {
    const ids: string[] = [];
    render(
      <OrganizerGrid
        model={model(none, tagCols)}
        resources={resources}
        getCardProps={noProps}
        renderCard={(info) => {
          ids.push(info.sortableId);
          return <div>{info.cardId}</div>;
        }}
      />,
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(organizerPlacementId("a", "all", "x"));
    expect(ids).toContain(organizerPlacementId("a", "all", "y"));
  });
});
