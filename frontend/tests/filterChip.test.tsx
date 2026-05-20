import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FilterChip, { type FilterChipField } from "../components/QueryBuilder/FilterChip";

const FIELD_TEXT: FilterChipField = { key: "synopsis", label: "Synopsis", type: "text" };
const FIELD_NUMBER: FilterChipField = { key: "wordCount", label: "Word Count", type: "number" };
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
        expect(screen.getByRole("button", { name: /Field: Synopsis/i })).toBeTruthy();
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
        expect(
            screen.queryByRole("combobox", { name: "Operator" }),
        ).toBeNull();
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
