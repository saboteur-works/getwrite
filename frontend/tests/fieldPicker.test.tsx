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
        render(
            <FieldPicker fields={FIELDS} value={null} onSelect={vi.fn()} />,
        );
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
        render(
            <FieldPicker fields={FIELDS} value={null} onSelect={vi.fn()} />,
        );
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
