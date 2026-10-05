/**
 * Component tests for `EntityKindStylesModal` (Feature 69, Task 6): the
 * kind-to-color/shape customization modal's row list, "new/unmapped"
 * section, and immediate-persist editing behavior.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

vi.mock("../../src/lib/api/entity-graph-kind-styles", () => ({
  getEntityGraphKindStyles: vi.fn(),
  saveEntityGraphKindStyle: vi.fn(),
}));

import {
  getEntityGraphKindStyles,
  saveEntityGraphKindStyle,
} from "../../src/lib/api/entity-graph-kind-styles";
import EntityKindStylesModal from "../../components/WorkArea/Views/EntityRelationshipGraphView/EntityKindStylesModal";
import { ENTITY_KIND_SHAPE_NAMES } from "../../components/WorkArea/Views/EntityRelationshipGraphView/entityKindShapes";
import { ENTITY_KIND_COLOR_SLOTS } from "../../components/WorkArea/Views/EntityRelationshipGraphView/entityKindShapes";

const mockGet = vi.mocked(getEntityGraphKindStyles);
const mockSave = vi.mocked(saveEntityGraphKindStyle);

afterEach(cleanup);

beforeEach(() => {
  mockGet.mockReset();
  mockSave.mockReset();
});

describe("EntityKindStylesModal", () => {
  it("populates both the configured and new/unmapped sections from mixed kinds", async () => {
    mockGet.mockResolvedValue([
      { entityKind: "character", color: "entity-kind-0", shape: "circle" },
    ]);

    render(
      <EntityKindStylesModal
        isOpen
        projectId="p1"
        declaredEntityKinds={["character", "place", "place", "faction"]}
        onClose={() => {}}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("configured-kind-row-character"),
      ).toBeInTheDocument(),
    );
    // "place" appears twice in declaredEntityKinds but only once as a row.
    expect(screen.getAllByTestId("unmapped-kind-row-place")).toHaveLength(1);
    expect(screen.getByTestId("unmapped-kind-row-faction")).toBeInTheDocument();
    expect(
      screen.queryByTestId("unmapped-kind-row-character"),
    ).not.toBeInTheDocument();
  });

  it("renders its dialog content with padding (p-6), matching every other Dialog-based modal", async () => {
    mockGet.mockResolvedValue([]);

    render(
      <EntityKindStylesModal
        isOpen
        projectId="p1"
        declaredEntityKinds={["character"]}
        onClose={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByRole("dialog").className).toContain("p-6");
  });

  it("persists a configured kind's color change immediately and reflects it without a reload", async () => {
    mockGet.mockResolvedValue([
      { entityKind: "character", color: "entity-kind-0", shape: "circle" },
    ]);
    mockSave.mockResolvedValue({
      entityKind: "character",
      color: "entity-kind-3",
      shape: "circle",
    });

    render(
      <EntityKindStylesModal
        isOpen
        projectId="p1"
        declaredEntityKinds={["character"]}
        onClose={() => {}}
      />,
    );

    await screen.findByTestId("configured-kind-row-character");

    fireEvent.change(screen.getByLabelText("character color"), {
      target: { value: "entity-kind-3" },
    });

    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith(
        "p1",
        "character",
        "entity-kind-3",
        "circle",
      ),
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText("character color") as HTMLSelectElement).value,
      ).toBe("entity-kind-3"),
    );
  });

  it("persists a configured kind's shape change immediately", async () => {
    mockGet.mockResolvedValue([
      { entityKind: "character", color: "entity-kind-0", shape: "circle" },
    ]);
    mockSave.mockResolvedValue({
      entityKind: "character",
      color: "entity-kind-0",
      shape: "star",
    });

    render(
      <EntityKindStylesModal
        isOpen
        projectId="p1"
        declaredEntityKinds={["character"]}
        onClose={() => {}}
      />,
    );

    await screen.findByTestId("configured-kind-row-character");

    fireEvent.change(screen.getByLabelText("character shape"), {
      target: { value: "star" },
    });

    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith(
        "p1",
        "character",
        "entity-kind-0",
        "star",
      ),
    );
  });

  it("saving a kind from the new/unmapped section moves it into the main list without a reload", async () => {
    mockGet.mockResolvedValue([]);
    mockSave.mockResolvedValue({
      entityKind: "place",
      color: "entity-kind-0",
      shape: "square",
    });

    render(
      <EntityKindStylesModal
        isOpen
        projectId="p1"
        declaredEntityKinds={["place"]}
        onClose={() => {}}
      />,
    );

    await screen.findByTestId("unmapped-kind-row-place");

    fireEvent.change(screen.getByLabelText("place shape"), {
      target: { value: "square" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save style/i }));

    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith(
        "p1",
        "place",
        "entity-kind-0",
        "square",
      ),
    );
    expect(
      await screen.findByTestId("configured-kind-row-place"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("unmapped-kind-row-place"),
    ).not.toBeInTheDocument();
  });

  it("never offers a color or shape option outside the fixed token-slot/shape sets", async () => {
    mockGet.mockResolvedValue([
      { entityKind: "character", color: "entity-kind-0", shape: "circle" },
    ]);

    render(
      <EntityKindStylesModal
        isOpen
        projectId="p1"
        declaredEntityKinds={["character", "place"]}
        onClose={() => {}}
      />,
    );

    await screen.findByTestId("configured-kind-row-character");

    const configuredColorOptions = Array.from(
      (screen.getByLabelText("character color") as HTMLSelectElement).options,
    ).map((option) => option.value);
    expect(configuredColorOptions).toEqual([...ENTITY_KIND_COLOR_SLOTS]);

    const configuredShapeOptions = Array.from(
      (screen.getByLabelText("character shape") as HTMLSelectElement).options,
    ).map((option) => option.value);
    expect(configuredShapeOptions).toEqual([...ENTITY_KIND_SHAPE_NAMES]);

    const unmappedColorOptions = Array.from(
      (screen.getByLabelText("place color") as HTMLSelectElement).options,
    ).map((option) => option.value);
    expect(unmappedColorOptions).toEqual([...ENTITY_KIND_COLOR_SLOTS]);

    const unmappedShapeOptions = Array.from(
      (screen.getByLabelText("place shape") as HTMLSelectElement).options,
    ).map((option) => option.value);
    expect(unmappedShapeOptions).toEqual([...ENTITY_KIND_SHAPE_NAMES]);
  });

  it("surfaces a failed load", async () => {
    mockGet.mockRejectedValue(new Error("network down"));

    render(
      <EntityKindStylesModal
        isOpen
        projectId="p1"
        declaredEntityKinds={[]}
        onClose={() => {}}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /network down|failed/i,
    );
  });

  it("legend lists every kind in use, configured or not, with its live color+shape (Task 7, FR-6)", async () => {
    mockGet.mockResolvedValue([
      { entityKind: "character", color: "entity-kind-2", shape: "diamond" },
    ]);

    render(
      <EntityKindStylesModal
        isOpen
        projectId="p1"
        declaredEntityKinds={["character", "place"]}
        onClose={() => {}}
      />,
    );

    const legend = await screen.findByTestId("entity-kind-styles-legend");
    expect(
      screen.getByTestId("entity-kind-styles-legend-row-character"),
    ).toHaveTextContent("Color 3, Diamond");
    expect(
      screen.getByTestId("entity-kind-styles-legend-row-place"),
    ).toHaveTextContent("Default color");
    expect(legend.children).toHaveLength(2);
  });

  it("legend reflects a save moving a kind from unmapped into configured, without a reload", async () => {
    mockGet.mockResolvedValue([]);
    mockSave.mockResolvedValue({
      entityKind: "place",
      color: "entity-kind-1",
      shape: "square",
    });

    render(
      <EntityKindStylesModal
        isOpen
        projectId="p1"
        declaredEntityKinds={["place"]}
        onClose={() => {}}
      />,
    );

    await screen.findByTestId("unmapped-kind-row-place");
    expect(
      screen.getByTestId("entity-kind-styles-legend-row-place"),
    ).toHaveTextContent("Default color");

    fireEvent.click(screen.getByRole("button", { name: /save style/i }));

    await waitFor(() =>
      expect(
        screen.getByTestId("entity-kind-styles-legend-row-place"),
      ).toHaveTextContent("Color 2, Square"),
    );
  });

  it("calls onStylesChanged with the saved record after a successful save", async () => {
    mockGet.mockResolvedValue([
      { entityKind: "character", color: "entity-kind-0", shape: "circle" },
    ]);
    mockSave.mockResolvedValue({
      entityKind: "character",
      color: "entity-kind-5",
      shape: "circle",
    });
    const onStylesChanged = vi.fn();

    render(
      <EntityKindStylesModal
        isOpen
        projectId="p1"
        declaredEntityKinds={["character"]}
        onClose={() => {}}
        onStylesChanged={onStylesChanged}
      />,
    );

    await screen.findByTestId("configured-kind-row-character");
    fireEvent.change(screen.getByLabelText("character color"), {
      target: { value: "entity-kind-5" },
    });

    await waitFor(() =>
      expect(onStylesChanged).toHaveBeenCalledWith({
        entityKind: "character",
        color: "entity-kind-5",
        shape: "circle",
      }),
    );
  });

  it("does not fetch when closed", () => {
    render(
      <EntityKindStylesModal
        isOpen={false}
        projectId="p1"
        declaredEntityKinds={[]}
        onClose={() => {}}
      />,
    );
    expect(mockGet).not.toHaveBeenCalled();
  });
});
