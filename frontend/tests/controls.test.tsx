import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EditorMenuColorSubmenu from "../components/Editor/MenuBar/EditorMenuColorSubmenu";
import EditorMenuInput from "../components/Editor/MenuBar/EditorMenuInput";
import NotesInput from "../components/Sidebar/controls/NotesInput";
import StatusSelector from "../components/Sidebar/controls/StatusSelector";
import MultiSelectList from "../components/Sidebar/controls/MultiSelectList";
import POVAutocomplete from "../components/Sidebar/controls/POVAutocomplete";
import DateTimeInput from "../components/Sidebar/controls/DateTimeInput";
import DurationInput from "../components/Sidebar/controls/DurationInput";

describe("Sidebar Controls", () => {
    it("NotesInput calls onChange", () => {
        const onChange = vi.fn();
        render(<NotesInput onChange={onChange} />);
        const ta = screen.getByLabelText("notes-input");
        fireEvent.change(ta, { target: { value: "hello" } });
        expect(onChange).toHaveBeenCalledWith("hello");
    });

    it("StatusSelector calls onChange", () => {
        const onChange = vi.fn();
        render(<StatusSelector onChange={onChange} />);
        const sel = screen.getByLabelText("status-select");
        fireEvent.change(sel, { target: { value: "review" } });
        expect(onChange).toHaveBeenCalledWith("review");
    });

    it.skip("MultiSelectList toggles selection (userEvent + waitFor)", async () => {
        const onChangeMock = vi.fn();
        const onChange = (v: string[]) => onChangeMock(v);

        render(<MultiSelectList items={["A", "B"]} onChange={onChange} />);
        const user = userEvent.setup();
        const checkboxes = screen.getAllByRole(
            "checkbox",
        ) as HTMLInputElement[];
        expect(checkboxes).toHaveLength(2);

        await user.click(checkboxes[0]);

        await waitFor(
            () => {
                expect(checkboxes[0]).toBeChecked();
                expect(onChangeMock).toHaveBeenCalled();
            },
            { timeout: 20000 },
        );
    });

    it("POVAutocomplete calls onChange", () => {
        const onChange = vi.fn();
        render(<POVAutocomplete onChange={onChange} options={["X"]} />);
        const input = screen.getByLabelText("pov-input");
        fireEvent.change(input, { target: { value: "X" } });
        expect(onChange).toHaveBeenCalledWith("X");
    });

    it("EditorMenuInput syncs schema-provided values and forwards select changes", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const { rerender } = render(
            <EditorMenuInput
                Icon="fontStyle"
                tooltipContent="Font Style"
                type="select"
                initialValue="Arial"
                options={["Arial", "Georgia"]}
                onChange={onChange}
            />,
        );

        const select = screen.getByRole("combobox", { name: /Font Style/i });
        expect(select).toHaveValue("Arial");

        rerender(
            <EditorMenuInput
                Icon="fontStyle"
                tooltipContent="Font Style"
                type="select"
                initialValue="Georgia"
                options={["Arial", "Georgia"]}
                onChange={onChange}
            />,
        );

        expect(
            screen.getByRole("combobox", { name: /Font Style/i }),
        ).toHaveValue("Georgia");

        await user.selectOptions(
            screen.getByRole("combobox", { name: /Font Style/i }),
            "Arial",
        );

        expect(onChange).toHaveBeenCalled();
    });

    it("DateTimeInput fires onChange with date-only string", () => {
        const onChange = vi.fn();
        render(<DateTimeInput onChange={onChange} />);
        const dateInput = screen.getByLabelText("story-date-input");
        fireEvent.change(dateInput, { target: { value: "2024-06-15" } });
        expect(onChange).toHaveBeenCalledWith("2024-06-15");
    });

    it("DateTimeInput fires onChange with combined datetime string when time is set", () => {
        const onChange = vi.fn();
        render(<DateTimeInput value="2024-06-15" onChange={onChange} />);
        const timeInput = screen.getByLabelText("story-date-input-time");
        fireEvent.change(timeInput, { target: { value: "14:30" } });
        expect(onChange).toHaveBeenCalledWith("2024-06-15T14:30");
    });

    it("DateTimeInput syncs to external value prop change", () => {
        const { rerender } = render(<DateTimeInput value="2024-01-01" />);
        const dateInput = screen.getByLabelText("story-date-input") as HTMLInputElement;
        expect(dateInput.value).toBe("2024-01-01");
        rerender(<DateTimeInput value="2024-12-31" />);
        expect(dateInput.value).toBe("2024-12-31");
    });

    it("DurationInput calls onChange with parsed integer", () => {
        const onChange = vi.fn();
        render(<DurationInput onChange={onChange} />);
        const input = screen.getByLabelText("story-duration-input");
        fireEvent.change(input, { target: { value: "60" } });
        expect(onChange).toHaveBeenCalledWith(60);
    });

    it("DurationInput calls onChange(null) when input is cleared", () => {
        const onChange = vi.fn();
        render(<DurationInput value={60} onChange={onChange} />);
        const input = screen.getByLabelText("story-duration-input");
        fireEvent.change(input, { target: { value: "" } });
        expect(onChange).toHaveBeenCalledWith(null);
    });

    it("EditorMenuColorSubmenu opens and forwards the chosen color", async () => {
        const user = userEvent.setup();
        const onSelectColor = vi.fn();

        render(
            <EditorMenuColorSubmenu
                iconName="fontColor"
                tooltipContent="Text Color"
                colors={["#111827", "#2563eb"]}
                activeColor="#111827"
                onSelectColor={onSelectColor}
            />,
        );

        await user.click(screen.getByRole("button", { name: /Text Color/i }));
        await user.click(
            screen.getByRole("menuitemradio", {
                name: /Select color #2563eb/i,
            }),
        );

        expect(onSelectColor).toHaveBeenCalledWith("#2563eb");
        expect(
            screen.queryByRole("menuitemradio", {
                name: /Select color #111827/i,
            }),
        ).not.toBeInTheDocument();
    });
});
