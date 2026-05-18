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
import EndDateInput from "../components/Sidebar/controls/EndDateInput";

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
        render(<StatusSelector onChange={onChange} options={["draft", "review", "published"]} />);
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

    it("POVAutocomplete calls onChange with ResourceRef when name matches", () => {
        const onChange = vi.fn();
        render(<POVAutocomplete onChange={onChange} resourceOptions={[{ id: "uuid-x", name: "X" }]} />);
        const input = screen.getByLabelText("pov-input");
        fireEvent.change(input, { target: { value: "X" } });
        expect(onChange).toHaveBeenCalledWith({ id: "uuid-x", name: "X" });
    });

    it("POVAutocomplete calls onChange with id: null when name has no match", () => {
        const onChange = vi.fn();
        render(<POVAutocomplete onChange={onChange} resourceOptions={[{ id: "uuid-x", name: "X" }]} />);
        const input = screen.getByLabelText("pov-input");
        fireEvent.change(input, { target: { value: "Unknown" } });
        expect(onChange).toHaveBeenCalledWith({ id: null, name: "Unknown" });
    });

    it("POVAutocomplete displays name when value is a ResourceRef object", () => {
        render(<POVAutocomplete value={{ id: "uuid-alice", name: "Alice" }} />);
        const input = screen.getByLabelText("pov-input") as HTMLInputElement;
        expect(input.value).toBe("Alice");
    });

    it("POVAutocomplete displays string value directly", () => {
        render(<POVAutocomplete value="legacy-string" />);
        const input = screen.getByLabelText("pov-input") as HTMLInputElement;
        expect(input.value).toBe("legacy-string");
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

    it("DurationInput renders quantity field and unit select", () => {
        render(<DurationInput />);
        expect(screen.getByLabelText("story-duration-quantity")).toBeInTheDocument();
        expect(screen.getByLabelText("story-duration-unit")).toBeInTheDocument();
    });

    it("DurationInput defaults to minutes unit when no value is passed", () => {
        render(<DurationInput />);
        const unitSelect = screen.getByLabelText("story-duration-unit") as HTMLSelectElement;
        expect(unitSelect.value).toBe("minutes");
    });

    it("DurationInput emits minutes when entering quantity in minutes", () => {
        const onChange = vi.fn();
        render(<DurationInput onChange={onChange} />);
        fireEvent.change(screen.getByLabelText("story-duration-quantity"), { target: { value: "60" } });
        expect(onChange).toHaveBeenCalledWith(60);
    });

    it("DurationInput emits correct minutes when unit is hours", () => {
        const onChange = vi.fn();
        render(<DurationInput onChange={onChange} />);
        fireEvent.change(screen.getByLabelText("story-duration-unit"), { target: { value: "hours" } });
        fireEvent.change(screen.getByLabelText("story-duration-quantity"), { target: { value: "2" } });
        expect(onChange).toHaveBeenCalledWith(120);
    });

    it("DurationInput emits correct minutes when unit is days", () => {
        const onChange = vi.fn();
        render(<DurationInput onChange={onChange} />);
        fireEvent.change(screen.getByLabelText("story-duration-unit"), { target: { value: "days" } });
        fireEvent.change(screen.getByLabelText("story-duration-quantity"), { target: { value: "1" } });
        expect(onChange).toHaveBeenCalledWith(1440);
    });

    it("DurationInput emits correct minutes when unit is years", () => {
        const onChange = vi.fn();
        render(<DurationInput onChange={onChange} />);
        fireEvent.change(screen.getByLabelText("story-duration-unit"), { target: { value: "years" } });
        fireEvent.change(screen.getByLabelText("story-duration-quantity"), { target: { value: "1" } });
        expect(onChange).toHaveBeenCalledWith(525960);
    });

    it("DurationInput calls onChange(null) when quantity is cleared", () => {
        const onChange = vi.fn();
        render(<DurationInput value={60} onChange={onChange} />);
        fireEvent.change(screen.getByLabelText("story-duration-quantity"), { target: { value: "" } });
        expect(onChange).toHaveBeenCalledWith(null);
    });

    it("DurationInput initialises to 2 hours when value=120 (smart unit detection)", () => {
        render(<DurationInput value={120} />);
        const qty = screen.getByLabelText("story-duration-quantity") as HTMLInputElement;
        const unit = screen.getByLabelText("story-duration-unit") as HTMLSelectElement;
        expect(qty.value).toBe("2");
        expect(unit.value).toBe("hours");
    });

    it("DurationInput initialises to 90 minutes when value=90 (no clean unit divisor)", () => {
        render(<DurationInput value={90} />);
        const qty = screen.getByLabelText("story-duration-quantity") as HTMLInputElement;
        const unit = screen.getByLabelText("story-duration-unit") as HTMLSelectElement;
        expect(qty.value).toBe("90");
        expect(unit.value).toBe("minutes");
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

describe("EndDateInput", () => {
    it("shows computed end date as read-only text when no override is active", () => {
        render(<EndDateInput computedEndDate="2024-06-01T02:00:00.000Z" />);
        expect(screen.queryByLabelText("story-end-date-input")).not.toBeInTheDocument();
        expect(screen.getByLabelText("end-date-override-toggle")).toBeInTheDocument();
    });

    it("shows em-dash when neither computed nor override value is present", () => {
        render(<EndDateInput />);
        expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("renders Override button", () => {
        render(<EndDateInput computedEndDate="2024-06-01T02:00:00.000Z" />);
        expect(screen.getByLabelText("end-date-override-toggle")).toBeInTheDocument();
    });

    it("clicking Override shows datetime-local input pre-filled with computed value", () => {
        render(<EndDateInput computedEndDate="2024-06-01T02:00:00.000Z" />);
        fireEvent.click(screen.getByLabelText("end-date-override-toggle"));
        const input = screen.getByLabelText("story-end-date-input") as HTMLInputElement;
        expect(input).toBeInTheDocument();
        expect(input.value).toBe("2024-06-01T02:00");
    });

    it("changing datetime-local input fires onChange with ISO string", () => {
        const onChange = vi.fn();
        render(<EndDateInput computedEndDate="2024-06-01T02:00:00.000Z" onChange={onChange} />);
        fireEvent.click(screen.getByLabelText("end-date-override-toggle"));
        fireEvent.change(screen.getByLabelText("story-end-date-input"), {
            target: { value: "2024-06-01T04:00" },
        });
        expect(onChange).toHaveBeenCalledWith("2024-06-01T04:00");
    });

    it("clicking Clear override fires onChange(null) and returns to read-only", () => {
        const onChange = vi.fn();
        render(<EndDateInput overrideValue="2024-06-01T04:00" onChange={onChange} />);
        expect(screen.getByLabelText("story-end-date-input")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /clear override/i }));
        expect(onChange).toHaveBeenCalledWith(null);
        expect(screen.queryByLabelText("story-end-date-input")).not.toBeInTheDocument();
    });

    it("shows editable input by default when overrideValue prop is provided", () => {
        render(<EndDateInput overrideValue="2024-06-01T04:00" />);
        const input = screen.getByLabelText("story-end-date-input") as HTMLInputElement;
        expect(input).toBeInTheDocument();
        expect(input.value).toBe("2024-06-01T04:00");
    });
});
