import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import MultiResourceRefInput from "../components/Sidebar/controls/MultiResourceRefInput";
import { makeStore } from "../src/store/store";
import type { ResourceRef } from "../src/lib/models/types";
import type { ResourceOption } from "../components/Sidebar/controls/ResourceRefInput";

const OPTIONS: ResourceOption[] = [
    { id: "id-alice", name: "Alice" },
    { id: "id-bob", name: "Bob" },
    { id: "id-charlie", name: "Charlie" },
];

function renderComponent(
    props: Partial<React.ComponentProps<typeof MultiResourceRefInput>> = {},
) {
    const store = makeStore();
    const result = render(
        <Provider store={store}>
            <MultiResourceRefInput
                label="Characters"
                resourceOptions={OPTIONS}
                {...props}
            />
        </Provider>,
    );
    return { store, ...result };
}

describe("MultiResourceRefInput", () => {
    it("renders the label", () => {
        renderComponent();
        expect(screen.getByText("Characters")).toBeTruthy();
    });

    it("renders chips for existing value entries with dismiss buttons", () => {
        renderComponent({
            value: [
                { id: "id-alice", name: "Alice" },
                { id: "id-bob", name: "Bob" },
            ],
        });
        expect(screen.getByRole("button", { name: "Alice" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Bob" })).toBeTruthy();
        expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(2);
    });

    it("typing one or more characters shows case-insensitive filtered suggestions", () => {
        renderComponent({ value: [] });
        const input = screen.getByLabelText("multi-resource-ref-input");
        fireEvent.change(input, { target: { value: "al" } });
        expect(screen.getByText("Alice")).toBeTruthy();
        expect(screen.queryByText("Bob")).toBeNull();
        expect(screen.queryByText("Charlie")).toBeNull();
    });

    it("clearing the input hides all suggestions", () => {
        renderComponent({ value: [] });
        const input = screen.getByLabelText("multi-resource-ref-input");
        fireEvent.change(input, { target: { value: "Al" } });
        fireEvent.change(input, { target: { value: "" } });
        expect(screen.queryByText("Alice")).toBeNull();
    });

    it("clicking a suggestion adds a chip and clears the input", () => {
        const onChange = vi.fn();
        renderComponent({ value: [], onChange });
        const input = screen.getByLabelText("multi-resource-ref-input");
        fireEvent.change(input, { target: { value: "Al" } });
        fireEvent.click(screen.getByText("Alice"));
        expect(onChange).toHaveBeenCalledWith([{ id: "id-alice", name: "Alice" }]);
        expect((input as HTMLInputElement).value).toBe("");
    });

    it("pressing Enter on an exact name match adds a chip and clears the input", () => {
        const onChange = vi.fn();
        renderComponent({ value: [], onChange });
        const input = screen.getByLabelText("multi-resource-ref-input");
        fireEvent.change(input, { target: { value: "Alice" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(onChange).toHaveBeenCalledWith([{ id: "id-alice", name: "Alice" }]);
        expect((input as HTMLInputElement).value).toBe("");
    });

    it("pressing Enter with no matching suggestion does nothing", () => {
        const onChange = vi.fn();
        renderComponent({ value: [], onChange });
        const input = screen.getByLabelText("multi-resource-ref-input");
        fireEvent.change(input, { target: { value: "Zebra" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(onChange).not.toHaveBeenCalled();
    });

    it("dismissing a chip removes only that chip, leaving others intact", () => {
        const onChange = vi.fn();
        renderComponent({
            value: [
                { id: "id-alice", name: "Alice" },
                { id: "id-bob", name: "Bob" },
            ],
            onChange,
        });
        const dismissButtons = screen.getAllByRole("button", { name: "Remove" });
        fireEvent.click(dismissButtons[0]);
        expect(onChange).toHaveBeenCalledWith([{ id: "id-bob", name: "Bob" }]);
    });

    it("pressing Backspace on an empty input removes the last chip", () => {
        const onChange = vi.fn();
        renderComponent({
            value: [
                { id: "id-alice", name: "Alice" },
                { id: "id-bob", name: "Bob" },
            ],
            onChange,
        });
        const input = screen.getByLabelText("multi-resource-ref-input");
        fireEvent.keyDown(input, { key: "Backspace" });
        expect(onChange).toHaveBeenCalledWith([{ id: "id-alice", name: "Alice" }]);
    });

    it("a chip with a non-null id renders a clickable label button", () => {
        renderComponent({
            value: [{ id: "id-alice", name: "Alice" }],
        });
        expect(screen.getByRole("button", { name: "Alice" })).toBeTruthy();
    });

    it("a chip with a null id does not render a clickable label button", () => {
        renderComponent({
            value: [{ id: null, name: "Unknown" }],
        });
        expect(screen.queryByRole("button", { name: "Unknown" })).toBeNull();
    });

    it("clicking a chip with a non-null id dispatches setSelectedResourceId", () => {
        const { store } = renderComponent({
            value: [{ id: "id-alice", name: "Alice" }],
        });
        fireEvent.click(screen.getByRole("button", { name: "Alice" }));
        expect(store.getState().resources.selectedResourceId).toBe("id-alice");
    });

    it("suggestions exclude resources already present in value", () => {
        renderComponent({
            value: [{ id: "id-alice", name: "Alice" }],
        });
        const input = screen.getByLabelText("multi-resource-ref-input");
        fireEvent.change(input, { target: { value: "a" } });
        // "Alice" is already selected — it appears once as the chip label,
        // but must not appear a second time as a suggestion list item.
        expect(screen.queryAllByText("Alice")).toHaveLength(1);
        expect(screen.getByText("Charlie")).toBeTruthy();
    });

    it("pressing Escape closes the dropdown without clearing the input value", () => {
        renderComponent({ value: [] });
        const input = screen.getByLabelText("multi-resource-ref-input");
        fireEvent.change(input, { target: { value: "Al" } });
        expect(screen.getByText("Alice")).toBeTruthy();
        fireEvent.keyDown(input, { key: "Escape" });
        expect(screen.queryByText("Alice")).toBeNull();
        expect((input as HTMLInputElement).value).toBe("Al");
    });
});
