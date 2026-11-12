import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrganizerGridToolbar, {
  type OrganizerAxisChoice,
  type OrganizerGridToolbarProps,
} from "../components/WorkArea/Views/OrganizerView/OrganizerGridToolbar";

const FIELDS: OrganizerAxisChoice[] = [
  { axis: { kind: "status" }, label: "Status" },
  { axis: { kind: "subtype" }, label: "Subtype" },
  { axis: { kind: "field", key: "pov" }, label: "Point of view" },
];

function renderToolbar(over: Partial<OrganizerGridToolbarProps> = {}) {
  const props: OrganizerGridToolbarProps = {
    fieldChoices: FIELDS,
    rows: "none",
    columns: "order",
    onRowsChange: vi.fn(),
    onColumnsChange: vi.fn(),
    source: { kind: "folder", folderId: "f1", scope: "children" },
    folderId: "f1",
    smartFolders: [
      { id: "q1", name: "Late drafts" },
      { id: "q2", name: "Needs work" },
    ],
    onSourceChange: vi.fn(),
    ...over,
  };
  const result = render(<OrganizerGridToolbar {...props} />);
  return { props, ...result };
}

function optionLabels(name: string): string[] {
  return within(screen.getByRole("combobox", { name }))
    .getAllByRole("option")
    .map((o: HTMLElement) => o.textContent ?? "");
}

describe("OrganizerGridToolbar", () => {
  it("Rows offers none and the passed fields, not order", () => {
    renderToolbar();
    expect(optionLabels("Rows")).toEqual([
      "None",
      "Status",
      "Subtype",
      "Point of view",
    ]);
  });

  it("Columns offers order and the passed fields, not none", () => {
    renderToolbar();
    expect(optionLabels("Columns")).toEqual([
      "Order",
      "Status",
      "Subtype",
      "Point of view",
    ]);
  });

  it("does not offer the field chosen for Columns in Rows", () => {
    renderToolbar({ columns: { kind: "status" } });
    expect(optionLabels("Rows")).toEqual(["None", "Subtype", "Point of view"]);
    expect(optionLabels("Columns")).toContain("Status");
  });

  it("does not offer the field chosen for Rows in Columns", () => {
    renderToolbar({ rows: { kind: "field", key: "pov" } });
    expect(optionLabels("Columns")).toEqual(["Order", "Status", "Subtype"]);
    expect(optionLabels("Rows")).toContain("Point of view");
  });

  it("shows the current selection in each picker", () => {
    renderToolbar({ rows: { kind: "subtype" }, columns: "order" });
    expect(screen.getByRole("combobox", { name: "Rows" })).toHaveValue(
      "subtype",
    );
    expect(screen.getByRole("combobox", { name: "Columns" })).toHaveValue(
      "order",
    );
  });

  it("reports the chosen axis for Rows and Columns", async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Rows" }),
      "Point of view",
    );
    expect(props.onRowsChange).toHaveBeenCalledWith({
      kind: "field",
      key: "pov",
    });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Columns" }),
      "Status",
    );
    expect(props.onColumnsChange).toHaveBeenCalledWith({ kind: "status" });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Rows" }),
      "Subtype",
    );
    expect(props.onRowsChange).toHaveBeenLastCalledWith({ kind: "subtype" });
  });

  it("reports none when Rows is set back to None", async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar({ rows: { kind: "status" } });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Rows" }),
      "None",
    );
    expect(props.onRowsChange).toHaveBeenCalledWith("none");
  });

  it("source select offers the two folder scopes and each smart folder", () => {
    renderToolbar();
    expect(optionLabels("Source")).toEqual([
      "This folder",
      "This folder and subfolders",
      "Late drafts",
      "Needs work",
    ]);
  });

  it("source select shows the current source", () => {
    const { unmount } = renderToolbar({
      source: { kind: "smart-folder", queryId: "q2" },
    });
    expect(screen.getByRole("combobox", { name: "Source" })).toHaveValue(
      "smart:q2",
    );
    unmount();
    renderToolbar({
      source: { kind: "folder", folderId: "f1", scope: "descendants" },
    });
    expect(screen.getByRole("combobox", { name: "Source" })).toHaveValue(
      "descendants",
    );
  });

  it("reports the chosen source, using the passed folder id", async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar({ folderId: "f9" });
    const select = screen.getByRole("combobox", { name: "Source" });
    await user.selectOptions(select, "This folder and subfolders");
    expect(props.onSourceChange).toHaveBeenLastCalledWith({
      kind: "folder",
      folderId: "f9",
      scope: "descendants",
    });
    await user.selectOptions(select, "Needs work");
    expect(props.onSourceChange).toHaveBeenLastCalledWith({
      kind: "smart-folder",
      queryId: "q2",
    });
  });

  it("reports the children scope when 'This folder' is chosen again", async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar({
      folderId: "f9",
      source: { kind: "folder", folderId: "f9", scope: "descendants" },
    });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Source" }),
      "This folder",
    );
    expect(props.onSourceChange).toHaveBeenCalledWith({
      kind: "folder",
      folderId: "f9",
      scope: "children",
    });
  });

  it("names a saved smart-folder source that is no longer listed, in text", () => {
    renderToolbar({ source: { kind: "smart-folder", queryId: "gone" } });
    expect(optionLabels("Source")).toContain("Smart folder (not found)");
    expect(screen.getByRole("combobox", { name: "Source" })).toHaveValue(
      "smart:gone",
    );
  });

  it("every control is a labelled native select reachable by Tab", async () => {
    const user = userEvent.setup();
    renderToolbar();
    const boxes = screen.getAllByRole("combobox");
    expect(boxes).toHaveLength(3);
    for (const box of boxes) {
      expect(box).toHaveAccessibleName();
    }
    await user.tab();
    expect(screen.getByRole("combobox", { name: "Source" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("combobox", { name: "Rows" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("combobox", { name: "Columns" })).toHaveFocus();
  });

  it("carries no colour-only state: each label is visible text", () => {
    renderToolbar();
    expect(screen.getByText("Rows")).toBeVisible();
    expect(screen.getByText("Columns")).toBeVisible();
    expect(screen.getByText("Source")).toBeVisible();
  });

  it("wraps and shrinks for 360px width and uses no hex or red colours", () => {
    renderToolbar();
    const toolbar = screen.getByRole("group", {
      name: "Organizer arrangement",
    });
    expect(toolbar.className).toContain("flex-wrap");
    for (const box of screen.getAllByRole("combobox")) {
      expect(box.className).toContain("min-w-0");
      expect(box.className).toContain("max-w-full");
    }
    expect(toolbar.outerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(toolbar.outerHTML).not.toMatch(/red/);
  });
});
