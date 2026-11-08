import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FieldPicker, {
  buildFieldPickerFields,
  type FieldPickerField,
} from "../components/QueryBuilder/FieldPicker";

const FIELDS: FieldPickerField[] = buildFieldPickerFields();

const SAVED_QUERIES = [
  { id: "q-1", name: "Act 2 Scenes" },
  { id: "q-2", name: "Draft Resources" },
];

function openPicker(label = "Select a field") {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

// ─── Trigger label ────────────────────────────────────────────────────────────

describe("FieldPicker — trigger label", () => {
  it("shows 'field…' when no field or refDisplay", () => {
    render(<FieldPicker fields={FIELDS} value={null} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Select a field" })).toBeTruthy();
  });

  it("shows @<refDisplay> when refDisplay is set", () => {
    render(
      <FieldPicker
        fields={FIELDS}
        value={null}
        onSelect={vi.fn()}
        refDisplay="Act 2 Scenes"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Saved query: @Act 2 Scenes" }),
    ).toBeTruthy();
  });
});

// ─── Saved queries section ────────────────────────────────────────────────────

describe("FieldPicker — saved queries section", () => {
  it("does not render saved queries section when prop omitted", () => {
    render(<FieldPicker fields={FIELDS} value={null} onSelect={vi.fn()} />);
    openPicker();
    expect(screen.queryByText("Saved queries")).toBeNull();
  });

  it("renders saved queries section when savedQueries provided", () => {
    render(
      <FieldPicker
        fields={FIELDS}
        value={null}
        onSelect={vi.fn()}
        savedQueries={SAVED_QUERIES}
        onSelectRef={vi.fn()}
      />,
    );
    openPicker();
    expect(screen.getByText("Saved queries")).toBeTruthy();
    expect(screen.getByText("@Act 2 Scenes")).toBeTruthy();
    expect(screen.getByText("@Draft Resources")).toBeTruthy();
  });

  it("calls onSelectRef with id and name when a saved query is clicked", () => {
    const onSelectRef = vi.fn();
    render(
      <FieldPicker
        fields={FIELDS}
        value={null}
        onSelect={vi.fn()}
        savedQueries={SAVED_QUERIES}
        onSelectRef={onSelectRef}
      />,
    );
    openPicker();
    fireEvent.click(screen.getByText("@Draft Resources"));
    expect(onSelectRef).toHaveBeenCalledWith("q-2", "Draft Resources");
  });

  it("closes the dropdown after picking a saved query", () => {
    render(
      <FieldPicker
        fields={FIELDS}
        value={null}
        onSelect={vi.fn()}
        savedQueries={SAVED_QUERIES}
        onSelectRef={vi.fn()}
      />,
    );
    openPicker();
    fireEvent.click(screen.getByText("@Act 2 Scenes"));
    expect(screen.queryByText("Saved queries")).toBeNull();
  });

  it("filters saved queries by search term", () => {
    render(
      <FieldPicker
        fields={FIELDS}
        value={null}
        onSelect={vi.fn()}
        savedQueries={SAVED_QUERIES}
        onSelectRef={vi.fn()}
      />,
    );
    openPicker();
    fireEvent.change(screen.getByRole("textbox", { name: "Search fields" }), {
      target: { value: "draft" },
    });
    expect(screen.queryByText("@Act 2 Scenes")).toBeNull();
    expect(screen.getByText("@Draft Resources")).toBeTruthy();
  });

  it("shows saved query badge on each saved query row", () => {
    render(
      <FieldPicker
        fields={FIELDS}
        value={null}
        onSelect={vi.fn()}
        savedQueries={SAVED_QUERIES}
        onSelectRef={vi.fn()}
      />,
    );
    openPicker();
    const badges = screen.getAllByText("saved");
    expect(badges).toHaveLength(2);
  });
});

describe("buildFieldPickerFields — intrinsic options", () => {
  it("offers Subtype with the project's subtype list as its values", () => {
    const fields = buildFieldPickerFields(
      undefined,
      undefined,
      undefined,
      false,
      ["Scene", "Chapter"],
    );
    const subtype = fields.find((f) => f.key === "resourceSubtype");
    expect(subtype?.label).toBe("Subtype");
    expect(subtype?.options).toEqual(["Scene", "Chapter"]);
  });

  it("offers Subtype with no values when the project has no list", () => {
    const subtype = buildFieldPickerFields().find(
      (f) => f.key === "resourceSubtype",
    );
    expect(subtype?.options).toEqual([]);
  });

  it("surfaces the Type intrinsic's select options", () => {
    const typeField = FIELDS.find((f) => f.key === "type");
    expect(typeField?.source).toBe("system");
    expect(typeField?.type).toBe("select");
    expect(typeField?.options).toEqual([
      "text",
      "image",
      "audio",
      "folder",
      "source",
    ]);
  });

  it("injects project statuses into the Statuses intrinsic options", () => {
    const withStatuses = buildFieldPickerFields(undefined, [
      "Draft",
      "In Review",
      "Published",
    ]);
    const statusesField = withStatuses.find((f) => f.key === "statuses");
    expect(statusesField?.type).toBe("multiselect");
    expect(statusesField?.options).toEqual(["Draft", "In Review", "Published"]);
  });

  it("leaves the Statuses intrinsic without options when none are configured", () => {
    const statusesField = FIELDS.find((f) => f.key === "statuses");
    expect(statusesField?.options).toBeUndefined();
  });

  it("injects project statuses into the builtin Status field's options (POS task_ee247eec)", () => {
    // DEFAULT_METADATA_SCHEMA's builtin "status" field (userMetadata.status,
    // `select` type) declares no options of its own — its values come from
    // config.statuses, not the schema — so without this override the Value
    // picker's dropdown had nothing to offer but "select…".
    const withStatuses = buildFieldPickerFields(undefined, [
      "Outline",
      "Draft",
      "Revised",
      "Polished",
    ]);
    const statusField = withStatuses.find((f) => f.key === "status");
    expect(statusField?.source).toBe("builtin");
    expect(statusField?.type).toBe("select");
    expect(statusField?.options).toEqual([
      "Outline",
      "Draft",
      "Revised",
      "Polished",
    ]);
  });

  it("gives the builtin Status field an empty list when none are configured (no built-in fallback)", () => {
    const statusField = FIELDS.find((f) => f.key === "status");
    expect(statusField?.options ?? []).toEqual([]);
  });

  it("leaves the intrinsic Statuses field with its empty configured-only list when none are configured", () => {
    for (const projectStatuses of [[], undefined]) {
      const fields = buildFieldPickerFields(undefined, projectStatuses);
      const statusesField = fields.find((f) => f.key === "statuses");
      expect(statusesField?.options).toBeUndefined();
    }
  });

  it("keeps the configured list for the Status chip and the intrinsic Statuses field", () => {
    const fields = buildFieldPickerFields(undefined, ["Outline", "Final"]);
    expect(fields.find((f) => f.key === "status")?.options).toEqual([
      "Outline",
      "Final",
    ]);
    expect(fields.find((f) => f.key === "statuses")?.options).toEqual([
      "Outline",
      "Final",
    ]);
  });

  it("gives the Status chip an empty list with no configured statuses, never Draft/In review/Published", () => {
    for (const projectStatuses of [[], undefined]) {
      const fields = buildFieldPickerFields(undefined, projectStatuses);
      const statusField = fields.find((f) => f.key === "status");
      expect(statusField?.options ?? []).toEqual([]);
    }
  });
});
