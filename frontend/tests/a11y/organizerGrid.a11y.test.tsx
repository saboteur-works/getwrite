/** @vitest-environment jsdom */
/**
 * Feature 109, Task 38 (FR-11): axe-core check of the Organizer grid and the
 * phone grouped lists (`docs/standards/accessibility.md`). The grid has a None
 * row and column, an Other values row, a card in two cells and empty cells,
 * and is also mounted inside a `DndContext` with draggable cards so the drag
 * attributes are present. `region` is disabled because the harness mounts no
 * app shell landmarks. jsdom cannot check colour contrast (`runAxe` disables
 * `color-contrast`): contrast is not verified here. No colour-only state is
 * asserted by class: state is read from text and roles.
 */
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import OrganizerGrid, {
  type OrganizerGridCardInfo,
} from "../../components/WorkArea/Views/OrganizerView/OrganizerGrid";
import OrganizerGridCell, {
  type OrganizerGridCellProps,
} from "../../components/WorkArea/Views/OrganizerView/OrganizerGridCell";
import OrganizerCard from "../../components/WorkArea/Views/OrganizerView/OrganizerCard";
import OrganizerPhoneGroups from "../../components/WorkArea/Views/OrganizerView/OrganizerPhoneGroups";
import {
  buildOrganizerGridModel,
  buildOrganizerPhoneGroups,
  type OrganizerGridAxisInput,
} from "../../components/WorkArea/Views/OrganizerView/organizerGridModel";
import {
  cardDraggableId,
  cellDroppableId,
} from "../../components/WorkArea/Views/OrganizerView/useOrganizerGridDrag";
import { createTextResource } from "../../src/lib/models/resource";
import type { AnyResource } from "../../src/lib/models/types";
import type {
  OrganizerAxisValue,
  OrganizerGridCard,
} from "../../src/lib/models/organizer-grid-types";
import { runAxe } from "./helpers/axe";

afterEach(cleanup);

const line = (key: string): OrganizerAxisValue => ({
  key,
  label: key,
  kind: "value",
  isDropTarget: true,
  value: key,
});

const ids = ["a", "b", "c", "d"];
const status: Record<string, string | undefined> = {
  a: "Draft",
  b: "Done",
  c: "Weird",
  d: undefined,
};
const act: Record<string, string | string[] | undefined> = {
  a: "One",
  b: ["One", "Two"],
  c: undefined,
  d: "One",
};
const rows: OrganizerGridAxisInput = {
  axis: { kind: "status" },
  list: { axis: { kind: "status" }, values: ["Draft", "Done"].map(line) },
  values: new Map(ids.map((id) => [id, status[id]])),
};
const columns: OrganizerGridAxisInput = {
  axis: { kind: "field", key: "act" },
  list: {
    axis: { kind: "field", key: "act" },
    values: ["One", "Two"].map(line),
  },
  values: new Map(ids.map((id) => [id, act[id]])),
};
const cards: OrganizerGridCard[] = ids.map((id) => ({ id, kind: "resource" }));
const model = buildOrganizerGridModel({ cards, rows, columns, cap: null });

const docs = ids.map((id) => ({
  ...createTextResource({ name: `Doc ${id}`, plainText: "x y" }),
  id,
}));
const resources = new Map<string, AnyResource>(docs.map((d) => [d.id, d]));

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
    <div>
      <OrganizerCard
        resource={info.resource}
        {...info.cardProps}
        cardRef={setNodeRef}
        dragHandleAttributes={attributes}
        dragHandleListeners={listeners}
      />
      {info.alsoInOtherCellsText && <p>{info.alsoInOtherCellsText}</p>}
    </div>
  );
}

describe("a11y: OrganizerGrid", () => {
  it("has no axe violations with None, Other values, a duplicate and empty cells (stock cards)", async () => {
    const { container } = render(
      <OrganizerGrid
        model={model}
        resources={resources}
        getCardProps={() => ({ onOpen: () => undefined })}
      />,
    );
    await runAxe(container, ["region"]);
  });

  it("has no axe violations inside a DndContext with draggable cards and droppable cells", async () => {
    const { container } = render(
      <DndContext>
        <OrganizerGrid
          model={model}
          resources={resources}
          getCardProps={() => ({ onOpen: () => undefined })}
          CellComponent={DroppableCell}
          renderCard={(info) => <DraggableCard info={info} />}
        />
      </DndContext>,
    );
    await runAxe(container, ["region"]);
  });

  it("shows the structure the test relies on: None, Other values, a duplicate note and an empty cell, in text", () => {
    render(
      <OrganizerGrid
        model={model}
        resources={resources}
        getCardProps={() => ({})}
      />,
    );
    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(
      screen.getByRole("rowheader", { name: "Other values" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("rowheader", { name: "None" })).toHaveLength(1);
    expect(
      screen.getByRole("columnheader", { name: "None" }),
    ).toBeInTheDocument();
    // The duplicate's first appearance is unmarked; the later one is marked.
    expect(screen.getAllByText("also in 1 other cell")).toHaveLength(1);
    expect(
      screen.getByRole("gridcell", { name: "Draft, Two, empty" }),
    ).toBeInTheDocument();
  });
});

describe("a11y: OrganizerPhoneGroups", () => {
  it("has no axe violations for the grouped lists with a duplicate and an empty group", async () => {
    const groups = buildOrganizerPhoneGroups(model);
    const { container } = render(
      <OrganizerPhoneGroups
        groups={groups}
        resourcesById={Object.fromEntries(resources)}
        selectedId="a"
        onSelect={() => undefined}
        onOpen={() => undefined}
      />,
    );
    expect(screen.queryByRole("grid")).toBeNull();
    await runAxe(container, ["region"]);
  });

  it("has no axe violations with rows set to none", async () => {
    const groups = buildOrganizerPhoneGroups(
      buildOrganizerGridModel({
        cards,
        rows: { axis: "none", list: null, values: new Map() },
        columns,
        cap: null,
      }),
    );
    const { container } = render(
      <OrganizerPhoneGroups
        groups={groups}
        resourcesById={Object.fromEntries(resources)}
        rowsNone
        onOpen={() => undefined}
      />,
    );
    await runAxe(container, ["region"]);
  });
});
