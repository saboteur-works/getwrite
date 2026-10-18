import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FilterChip, {
  type FilterChipField,
  type FilterChipValue,
} from "../components/QueryBuilder/FilterChip";
import { groupsToAst } from "../components/QueryBuilder/ast-chip-bridge";
import {
  OPERATORS_BY_TYPE,
  valueForOperatorChange,
} from "../components/QueryBuilder/operator-utils";
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

  // Task 25 changed this assertion (FR-28): it recorded the {amount, unit}
  // object being carried into "is on" as intended; Task 25 b resets it.
  it("changing away from 'in the last' to a value operator resets the value to empty", () => {
    const onValueChange = chooseOperator(
      DATE_FIELDS[0],
      "in-the-last",
      SEVEN_DAYS,
      "is-on",
    );
    expect(onValueChange).toHaveBeenCalledWith("");
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

  // Feature 86 Task 25 (FR-12, FR-9, FR-17).
  describe("amount input holds a whole number (Task 25 a)", () => {
    function typeAmount(
      raw: string,
      value: FilterChipValue = SEVEN_DAYS,
    ): ReturnType<typeof vi.fn> {
      const onValueChange = vi.fn();
      render(
        <FilterChip
          field={DATE_FIELDS[0]}
          operator="in-the-last"
          value={value}
          onOperatorChange={vi.fn()}
          onValueChange={onValueChange}
        />,
      );
      fireEvent.change(screen.getByRole("spinbutton", { name: "Amount" }), {
        target: { value: raw },
      });
      return onValueChange;
    }

    it("amount holds 1 after typing 1.5, and the saved AST carries a whole amount", () => {
      const onValueChange = typeAmount("1.5");
      expect(onValueChange).toHaveBeenCalledWith({ amount: 1, unit: "days" });
      const saved = onValueChange.mock.calls[0][0] as FilterChipValue;
      expect(savedAst(DATE_FIELDS[0], saved)).toEqual({
        op: "gte",
        field: "dt",
        value: { amount: 1, unit: "days" },
      });
    });

    it("amount holds 3 after typing 3.9", () => {
      expect(typeAmount("3.9")).toHaveBeenCalledWith({
        amount: 3,
        unit: "days",
      });
    });

    it("amount holds 1 after typing 0", () => {
      expect(typeAmount("0")).toHaveBeenCalledWith({ amount: 1, unit: "days" });
    });

    it("an empty entry is ignored and the previous amount stays", () => {
      expect(typeAmount("")).not.toHaveBeenCalled();
    });

    it("a whole number typed is kept as typed", () => {
      expect(typeAmount("12")).toHaveBeenCalledWith({
        amount: 12,
        unit: "days",
      });
    });
  });

  describe("leaving 'in the last' resets the value (Task 25 b, d)", () => {
    const NEXT_EMPTY: Array<[string, FilterChipValue]> = [
      ["is-before", ""],
      ["is-after", ""],
      ["is-on", ""],
      ["is-between", { from: "", to: "" }],
    ];
    for (const [next, empty] of NEXT_EMPTY) {
      it(`valueForOperatorChange to ${next} returns the empty value, not the amount object`, () => {
        expect(valueForOperatorChange("date", next, SEVEN_DAYS)).toEqual(empty);
      });

      it(`choosing ${next} from 'in the last' sets the empty value and the saved AST holds no object`, () => {
        const onValueChange = chooseOperator(
          DATE_FIELDS[0],
          "in-the-last",
          SEVEN_DAYS,
          next,
        );
        expect(onValueChange).toHaveBeenCalledWith(empty);
        const ast = groupsToAst(
          [
            {
              id: "g",
              combinator: "and",
              chips: [
                {
                  id: "c",
                  field: DATE_FIELDS[0],
                  operator: next,
                  value: empty,
                },
              ],
            },
          ],
          "and",
        );
        expect(JSON.stringify(ast)).not.toContain("amount");
      });
    }

    it("a switch between two non-relative date operators keeps the date string", () => {
      expect(valueForOperatorChange("date", "is-after", "2026-03-01")).toBe(
        "2026-03-01",
      );
      const onValueChange = chooseOperator(
        DATE_FIELDS[0],
        "is-before",
        "2026-03-01",
        "is-on",
      );
      expect(onValueChange).not.toHaveBeenCalled();
    });
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
// The host (AppShell.tsx) hands the project's tags to buildFieldPickerFields,
// which sets `tagOptions` on the Tags field; the resource resolver is still
// passed, as in the app, and must not be consulted. Committing = clicking the offered suggestion (no Enter handler exists
// in FilterChip/ValuePicker, so Enter is not asserted).
describe("FilterChip — Tags chip in a project with tags alpha and beta", () => {
  const PROJECT_RESOURCES = [
    { id: "res-1", name: "Chapter One", folderId: undefined },
    { id: "res-2", name: "Scene Two", folderId: undefined },
    { id: "res-3", name: "Epilogue", folderId: undefined },
  ];
  const TAG_ALPHA = { id: "tag-alpha", name: "alpha" };
  const TAG_BETA = { id: "tag-beta", name: "beta" };

  function renderTagsChip(): { values: FilterChipValue[] } {
    const tagsField = buildFieldPickerFields(undefined, undefined, [
      TAG_ALPHA,
      TAG_BETA,
    ]).find((f) => f.key === "tags");
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

  it("lists the project's tags when typing 'a'", () => {
    renderTagsChip();
    const offered = typeAndListOptions("a");
    expect(offered).toEqual(expect.arrayContaining(["alpha", "beta"]));
  });

  it("offers no resource names in the value box", () => {
    renderTagsChip();
    const offered = typeAndListOptions("e");
    const resourceNames = PROJECT_RESOURCES.map((r) => r.name);
    expect(offered.filter((o) => resourceNames.includes(o))).toEqual([]);
  });

  it("stores an { id, name } tag reference after typing 'alpha' and choosing the offered suggestion", () => {
    const { values } = renderTagsChip();
    typeAndListOptions("alpha");
    const option = suggestionElements()[0];
    if (option) fireEvent.click(option);
    expect(values[values.length - 1]).toEqual(TAG_ALPHA);
  });
});

describe("Tags field operators and condition form (Feature 86 D-19)", () => {
  it("offers the same operators as before: those of multi-resource-ref", () => {
    const tags = buildFieldPickerFields().find((f) => f.key === "tags");
    expect(tags?.type).toBe("multi-resource-ref");
    const ids = OPERATORS_BY_TYPE[tags?.type ?? "text"].flatMap((e) =>
      e === "divider" ? [] : [e.value],
    );
    expect(ids).toEqual([
      "includes",
      "does-not-include",
      "includes-all-of",
      "includes-any-of",
      "includes-none-of",
      "is-empty",
      "has-any-value",
    ]);
  });

  it("a Tags condition built from a chosen tag stores an { id, name } reference", () => {
    const tagsField = buildFieldPickerFields(undefined, undefined, [
      { id: "tag-alpha", name: "alpha" },
    ]).find((f) => f.key === "tags") as FilterChipField;
    const onValueChange = vi.fn();
    render(
      <FilterChip
        field={tagsField}
        operator="includes"
        value={null}
        onValueChange={onValueChange}
      />,
    );
    const input = document.querySelector<HTMLInputElement>(
      ".picker-typeahead__input",
    );
    if (!input) throw new Error("no typeahead input");
    fireEvent.change(input, { target: { value: "alp" } });
    const option = screen
      .queryAllByRole("option")
      .find((o: HTMLElement) => o.textContent === "alpha");
    if (!option) throw new Error("tag not offered");
    fireEvent.click(option);
    expect(onValueChange).toHaveBeenCalledWith({
      id: "tag-alpha",
      name: "alpha",
    });
  });
});
