import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FilterChip, {
  type FilterChipField,
  type FilterChipValue,
} from "../components/QueryBuilder/FilterChip";
import { groupsToAst } from "../components/QueryBuilder/ast-chip-bridge";
import { valueForOperatorChange } from "../components/QueryBuilder/operator-utils";
import { buildFieldPickerFields } from "../components/QueryBuilder/FieldPicker";
import { filterResourceOptionsByScope } from "../components/Sidebar/folderScope";

const FIELD_TEXT: FilterChipField = {
  key: "synopsis",
  label: "Synopsis",
  type: "text",
};
const FIELD_NUMBER: FilterChipField = {
  key: "wordCount",
  label: "Word Count",
  type: "number",
};
const FIELD_FOLDER: FilterChipField = {
  key: "folderId",
  label: "Folder",
  type: "resource-ref",
  isFolderField: true,
};
const FIELDS = [FIELD_TEXT, FIELD_NUMBER];

const SAVED_QUERIES = [
  { id: "q-1", name: "Act 2 Scenes" },
  { id: "q-2", name: "Draft Resources" },
];

// ─── Regular chip rendering ───────────────────────────────────────────────────

describe("FilterChip — regular chip", () => {
  it("renders a group role", () => {
    render(<FilterChip field={null} operator={null} value={null} />);
    expect(screen.getByRole("group")).toBeTruthy();
  });

  it("shows FieldPicker trigger when availableFields provided", () => {
    render(
      <FilterChip
        field={FIELD_TEXT}
        operator="is"
        value="hi"
        availableFields={FIELDS}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Field: Synopsis/i }),
    ).toBeTruthy();
  });

  it("shows operator select when field and operator set", () => {
    render(
      <FilterChip
        field={FIELD_TEXT}
        operator="is"
        value="hi"
        availableFields={FIELDS}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Operator" })).toBeTruthy();
  });

  it("does not have filter-chip--ref class for a regular chip", () => {
    const { container } = render(
      <FilterChip field={FIELD_TEXT} operator="is" value="hi" />,
    );
    expect(container.firstChild).not.toHaveClass("filter-chip--ref");
  });
});

// ─── Ref chip rendering ───────────────────────────────────────────────────────

describe("FilterChip — ref chip variant", () => {
  it("has filter-chip--ref class when refId is set", () => {
    const { container } = render(
      <FilterChip
        field={null}
        operator={null}
        value={null}
        refId="q-1"
        refName="Act 2 Scenes"
        availableFields={FIELDS}
      />,
    );
    expect(container.firstChild).toHaveClass("filter-chip--ref");
  });

  it("shows @<refName> in the FieldPicker trigger", () => {
    render(
      <FilterChip
        field={null}
        operator={null}
        value={null}
        refId="q-1"
        refName="Act 2 Scenes"
        availableFields={FIELDS}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Saved query: @Act 2 Scenes/i }),
    ).toBeTruthy();
  });

  it("does not render an operator select for a ref chip", () => {
    render(
      <FilterChip
        field={null}
        operator={null}
        value={null}
        refId="q-1"
        refName="My Query"
        availableFields={FIELDS}
      />,
    );
    expect(screen.queryByRole("combobox", { name: "Operator" })).toBeNull();
  });

  it("still shows overflow menu when onDelete provided", () => {
    render(
      <FilterChip
        field={null}
        operator={null}
        value={null}
        refId="q-1"
        refName="My Query"
        availableFields={FIELDS}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Chip actions" })).toBeTruthy();
  });

  it("calls onDelete from overflow menu for ref chip", () => {
    const onDelete = vi.fn();
    render(
      <FilterChip
        field={null}
        operator={null}
        value={null}
        refId="q-1"
        refName="My Query"
        availableFields={FIELDS}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Chip actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("shows @<refId> as fallback when refName is empty", () => {
    render(
      <FilterChip
        field={null}
        operator={null}
        value={null}
        refId="q-1"
        refName=""
        availableFields={FIELDS}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Saved query: @/i }),
    ).toBeTruthy();
  });
});

// ─── Folder field autocomplete ────────────────────────────────────────────────

describe("FilterChip — folder field typeahead", () => {
  it("uses resolveFolderOptions instead of resolveResourceOptions for isFolderField", () => {
    const resolveFolderOptions = vi.fn().mockReturnValue([
      { id: "folder-1", name: "Act 1" },
      { id: "folder-2", name: "Act 2" },
    ]);
    const resolveResourceOptions = vi
      .fn()
      .mockReturnValue([{ id: "res-1", name: "Scene 1" }]);

    render(
      <FilterChip
        field={FIELD_FOLDER}
        operator="is"
        value={null}
        resolveResourceOptions={resolveResourceOptions}
        resolveFolderOptions={resolveFolderOptions}
      />,
    );

    expect(resolveFolderOptions).toHaveBeenCalled();
    expect(resolveResourceOptions).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("search…")).toBeTruthy();
  });

  it("shows folder names in the typeahead suggestions", () => {
    const resolveFolderOptions = vi.fn().mockReturnValue([
      { id: "folder-1", name: "Act 1" },
      { id: "folder-2", name: "Act 2" },
    ]);

    render(
      <FilterChip
        field={FIELD_FOLDER}
        operator="is"
        value={null}
        resolveFolderOptions={resolveFolderOptions}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("search…"), {
      target: { value: "Act" },
    });

    expect(screen.getByText("Act 1")).toBeTruthy();
    expect(screen.getByText("Act 2")).toBeTruthy();
  });
});

// ─── FieldPicker saved queries integration ────────────────────────────────────

describe("FilterChip — saved queries in FieldPicker", () => {
  it("opens FieldPicker and shows saved queries section", () => {
    render(
      <FilterChip
        field={null}
        operator={null}
        value={null}
        availableFields={FIELDS}
        savedQueries={SAVED_QUERIES}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Select a field/i }));
    expect(screen.getByText("Saved queries")).toBeTruthy();
    expect(screen.getByText("@Act 2 Scenes")).toBeTruthy();
    expect(screen.getByText("@Draft Resources")).toBeTruthy();
  });

  it("calls onRefChange when a saved query is picked", () => {
    const onRefChange = vi.fn();
    render(
      <FilterChip
        field={null}
        operator={null}
        value={null}
        availableFields={FIELDS}
        savedQueries={SAVED_QUERIES}
        onRefChange={onRefChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Select a field/i }));
    fireEvent.click(screen.getByText("@Act 2 Scenes"));
    expect(onRefChange).toHaveBeenCalledWith("q-1", "Act 2 Scenes");
  });
});

// ─── "in the last" default value (Feature 86 Task 22, FR-33) ──────────────────

describe("FilterChip — choosing 'in the last' on a date field (FR-33)", () => {
  const SEVEN_DAYS: FilterChipValue = { amount: 7, unit: "days" };
  const DATE_FIELDS: FilterChipField[] = [
    { key: "dt", label: "Due", type: "date" },
    { key: "createdAt", label: "Created", type: "date" },
    { key: "updatedAt", label: "Updated", type: "date" },
  ];

  function chooseOperator(
    field: FilterChipField,
    from: string,
    value: FilterChipValue,
    to: string,
  ): ReturnType<typeof vi.fn> {
    const onValueChange = vi.fn();
    render(
      <FilterChip
        field={field}
        operator={from}
        value={value}
        onOperatorChange={vi.fn()}
        onValueChange={onValueChange}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Operator" }), {
      target: { value: to },
    });
    return onValueChange;
  }

  function savedAst(field: FilterChipField, value: FilterChipValue): unknown {
    return groupsToAst(
      [
        {
          id: "g",
          combinator: "and",
          chips: [{ id: "c", field, operator: "in-the-last", value }],
        },
      ],
      "and",
    );
  }

  for (const field of DATE_FIELDS) {
    it(`sets {amount: 7, unit: "days"} on ${field.key} and saves it`, () => {
      const onValueChange = chooseOperator(field, "is-on", null, "in-the-last");
      expect(onValueChange).toHaveBeenCalledWith(SEVEN_DAYS);
      expect(savedAst(field, SEVEN_DAYS)).toEqual({
        op: "gte",
        field: field.key,
        value: SEVEN_DAYS,
      });
    });
  }

  it("replaces a stale value of another shape", () => {
    const onValueChange = chooseOperator(
      DATE_FIELDS[0],
      "is-before",
      "2026-03-01",
      "in-the-last",
    );
    expect(onValueChange).toHaveBeenCalledWith(SEVEN_DAYS);
  });

  it("keeps an existing relative-date value", () => {
    const kept = { amount: 3, unit: "weeks" } as const;
    expect(valueForOperatorChange("date", "in-the-last", kept)).toBe(kept);
  });

  it("changing away from 'in the last' to a value operator leaves the value alone", () => {
    const onValueChange = chooseOperator(
      DATE_FIELDS[0],
      "in-the-last",
      SEVEN_DAYS,
      "is-on",
    );
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("changing away from 'in the last' to a no-value operator resets to null", () => {
    const onValueChange = chooseOperator(
      DATE_FIELDS[0],
      "in-the-last",
      SEVEN_DAYS,
      "is-empty",
    );
    expect(onValueChange).toHaveBeenCalledWith(null);
  });

  it("an edited 'in the last' chip saves the same output form", () => {
    expect(savedAst(DATE_FIELDS[1], { amount: 2, unit: "months" })).toEqual({
      op: "gte",
      field: "createdAt",
      value: { amount: 2, unit: "months" },
    });
  });
});

// ─── Tags chip option source (Feature 86 D-19, FR-19/FR-20) ──────────────────
// Assumption: the real host (AppShell.tsx) passes a Tags chip only
// `resolveResourceOptions`, built from the project's resources with
// filterResourceOptionsByScope; no prop carries tags yet (Task 15 decides where
// they reach the builder). The project's tags below are therefore fixture data
// the test cannot hand to the chip, and the test enters through the production
// props. Committing = clicking the offered suggestion (no Enter handler exists
// in FilterChip/ValuePicker, so Enter is not asserted).
describe("FilterChip — Tags chip in a project with tags alpha and beta", () => {
  const PROJECT_RESOURCES = [
    { id: "res-1", name: "Chapter One", folderId: undefined },
    { id: "res-2", name: "Scene Two", folderId: undefined },
    { id: "res-3", name: "Epilogue", folderId: undefined },
  ];
  const TAG_ALPHA = { id: "tag-alpha", name: "alpha" };

  function renderTagsChip(): { values: FilterChipValue[] } {
    const tagsField = buildFieldPickerFields().find((f) => f.key === "tags");
    if (!tagsField) throw new Error("tags field missing");
    const seen: FilterChipValue[] = [];
    function Harness(): JSX.Element {
      const [value, setValue] = React.useState<FilterChipValue>(null);
      return (
        <FilterChip
          field={tagsField as FilterChipField}
          operator="includes"
          value={value}
          resolveResourceOptions={(refFolder, includeSubfolders) =>
            filterResourceOptionsByScope(
              PROJECT_RESOURCES,
              [],
              refFolder,
              includeSubfolders,
            )
          }
          onValueChange={(v) => {
            seen.push(v);
            setValue(v);
          }}
        />
      );
    }
    render(<Harness />);
    return { values: seen };
  }

  function suggestionElements(): HTMLElement[] {
    return screen
      .queryAllByRole("option")
      .filter((o: HTMLElement) => o.closest("select") === null);
  }

  function typeAndListOptions(text: string): string[] {
    const input = document.querySelector<HTMLInputElement>(
      ".picker-typeahead__input",
    );
    if (!input) throw new Error("no typeahead input");
    fireEvent.change(input, { target: { value: text } });
    return suggestionElements().map((o: HTMLElement) => o.textContent ?? "");
  }

  it.fails(
    "lists the project's resources, not its tags, when typing 'a' [expected failure: D-19]",
    () => {
      renderTagsChip();
      const offered = typeAndListOptions("a");
      expect(offered).toEqual(expect.arrayContaining(["alpha", "beta"]));
    },
  );

  it.fails(
    "offers resource names in the value box [expected failure: D-19]",
    () => {
      renderTagsChip();
      const offered = typeAndListOptions("e");
      const resourceNames = PROJECT_RESOURCES.map((r) => r.name);
      expect(offered.filter((o) => resourceNames.includes(o))).toEqual([]);
    },
  );

  it.fails(
    "leaves the chip value empty after typing 'alpha' and choosing the offered suggestion [expected failure: D-19]",
    () => {
      const { values } = renderTagsChip();
      typeAndListOptions("alpha");
      const option = suggestionElements()[0];
      if (option) fireEvent.click(option);
      expect(values[values.length - 1]).toEqual(TAG_ALPHA);
    },
  );
});
