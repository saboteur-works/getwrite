import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Checkbox from "../../components/common/UI/Checkbox/Checkbox";

describe("a11y: Checkbox primitive", () => {
    it("renders a native checkbox input", () => {
        render(<Checkbox aria-label="include headers" />);
        expect(screen.getByRole("checkbox")).toBeInTheDocument();
    });

    it("renders checked when checked prop is true", () => {
        render(<Checkbox aria-label="include headers" checked onChange={vi.fn()} />);
        expect(screen.getByRole("checkbox")).toBeChecked();
    });

    it("renders unchecked when checked prop is false", () => {
        render(<Checkbox aria-label="include headers" checked={false} onChange={vi.fn()} />);
        expect(screen.getByRole("checkbox")).not.toBeChecked();
    });

    it("calls onChange when clicked", async () => {
        const onChange = vi.fn();
        render(<Checkbox aria-label="include headers" onChange={onChange} />);
        await userEvent.click(screen.getByRole("checkbox"));
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("disabled checkbox is not interactable", async () => {
        const onChange = vi.fn();
        render(<Checkbox aria-label="include headers" disabled onChange={onChange} />);
        const cb = screen.getByRole("checkbox");
        expect(cb).toBeDisabled();
        await userEvent.click(cb);
        expect(onChange).not.toHaveBeenCalled();
    });

    it("forwards ref to the underlying input element", () => {
        const ref = React.createRef<HTMLInputElement>();
        render(<Checkbox ref={ref} aria-label="include headers" />);
        expect(ref.current).toBeInstanceOf(HTMLInputElement);
    });

    it("ref can be used to set indeterminate state", () => {
        const ref = React.createRef<HTMLInputElement>();
        render(<Checkbox ref={ref} aria-label="include headers" />);
        if (ref.current) ref.current.indeterminate = true;
        expect(ref.current?.indeterminate).toBe(true);
    });

    it("caller className is merged with base classes", () => {
        render(<Checkbox aria-label="include headers" className="w-[13px] h-[13px]" />);
        const cb = screen.getByRole("checkbox");
        expect(cb.className).toContain("w-[13px]");
        expect(cb.className).toContain("cursor-pointer");
    });

    it("forwards aria-label to the checkbox element", () => {
        render(<Checkbox aria-label="compile all resources" />);
        expect(screen.getByRole("checkbox", { name: "compile all resources" })).toBeInTheDocument();
    });
});
