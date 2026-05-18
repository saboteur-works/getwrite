import React from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import NumberInput from "../components/Sidebar/controls/NumberInput";
import BooleanToggle from "../components/Sidebar/controls/BooleanToggle";
import SelectInput from "../components/Sidebar/controls/SelectInput";
import ResourceRefInput from "../components/Sidebar/controls/ResourceRefInput";

describe("Dynamic Sidebar Controls", () => {
    describe("NumberInput", () => {
        it("calls onChange with numeric value", () => {
            const onChange = vi.fn();
            render(<NumberInput label="Word Count" onChange={onChange} />);
            const input = screen.getByLabelText("number-input");
            fireEvent.change(input, { target: { value: "5000" } });
            expect(onChange).toHaveBeenCalledWith(5000);
        });

        it("syncs external value prop changes", () => {
            const { rerender } = render(
                <NumberInput label="Word Count" value={1000} />,
            );
            const input = screen.getByLabelText(
                "number-input",
            ) as HTMLInputElement;
            expect(input.value).toBe("1000");
            rerender(<NumberInput label="Word Count" value={2000} />);
            expect(input.value).toBe("2000");
        });
    });

    describe("BooleanToggle", () => {
        it("calls onChange with boolean value", () => {
            const onChange = vi.fn();
            render(<BooleanToggle label="Published" onChange={onChange} />);
            const checkbox = screen.getByLabelText(
                "boolean-toggle",
            ) as HTMLInputElement;
            fireEvent.click(checkbox);
            expect(onChange).toHaveBeenCalledWith(true);
        });

        it("syncs external value prop changes", () => {
            const { rerender } = render(
                <BooleanToggle label="Published" value={false} />,
            );
            const checkbox = screen.getByLabelText(
                "boolean-toggle",
            ) as HTMLInputElement;
            expect(checkbox.checked).toBe(false);
            rerender(<BooleanToggle label="Published" value={true} />);
            expect(checkbox.checked).toBe(true);
        });
    });

    describe("SelectInput", () => {
        const OPTIONS = ["Fantasy", "Science Fiction", "Romance"];

        it("single select calls onChange with string value", () => {
            const onChange = vi.fn();
            render(
                <SelectInput
                    label="Genre"
                    options={OPTIONS}
                    onChange={onChange}
                    multiple={false}
                />,
            );
            const select = screen.getByLabelText("select-input");
            fireEvent.change(select, { target: { value: "Science Fiction" } });
            expect(onChange).toHaveBeenCalledWith("Science Fiction");
        });

        it("multiple select calls onChange with string array", () => {
            const onChange = vi.fn();
            render(
                <SelectInput
                    label="Genres"
                    options={OPTIONS}
                    onChange={onChange}
                    multiple={true}
                />,
            );
            const select = screen.getByLabelText(
                "select-input",
            ) as HTMLSelectElement;
            const options = select.options;
            options[0].selected = true;
            options[1].selected = true;
            fireEvent.change(select);
            expect(onChange).toHaveBeenCalledWith([OPTIONS[0], OPTIONS[1]]);
        });
    });

    describe("ResourceRefInput", () => {
        const RESOURCES = [
            { id: "uuid-alice", name: "Alice" },
            { id: "uuid-bob", name: "Bob" },
        ];

        it("single mode resolves known names to ResourceRef", () => {
            const onChange = vi.fn();
            render(
                <ResourceRefInput
                    label="Character"
                    resourceOptions={RESOURCES}
                    onChange={onChange}
                    multiple={false}
                />,
            );
            const input = screen.getByLabelText("resource-ref-input");
            fireEvent.change(input, { target: { value: "Alice" } });
            expect(onChange).toHaveBeenCalledWith({
                id: "uuid-alice",
                name: "Alice",
            });
        });

        it("single mode emits id:null when there is no match", () => {
            const onChange = vi.fn();
            render(
                <ResourceRefInput
                    label="Character"
                    resourceOptions={RESOURCES}
                    onChange={onChange}
                    multiple={false}
                />,
            );
            const input = screen.getByLabelText("resource-ref-input");
            fireEvent.change(input, { target: { value: "Unknown" } });
            expect(onChange).toHaveBeenCalledWith({
                id: null,
                name: "Unknown",
            });
        });

        it("multiple mode renders existing refs as comma-separated names", () => {
            render(
                <ResourceRefInput
                    label="Characters"
                    resourceOptions={RESOURCES}
                    value={[
                        { id: "uuid-alice", name: "Alice" },
                        { id: "uuid-bob", name: "Bob" },
                    ]}
                    multiple={true}
                />,
            );
            const input = screen.getByLabelText(
                "resource-ref-input",
            ) as HTMLInputElement;
            expect(input.value).toBe("Alice, Bob");
        });
    });
});
