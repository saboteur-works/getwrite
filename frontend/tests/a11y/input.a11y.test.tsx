import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Input from "../../components/common/UI/Input/Input";

describe("a11y: Input primitive", () => {
    it("renders a native text input by default", () => {
        render(<Input aria-label="name" />);
        expect(screen.getByRole("textbox")).toBeInTheDocument();
    });

    it("forwards type prop to the underlying input element", () => {
        render(<Input type="number" aria-label="count" />);
        const input = screen.getByRole("spinbutton");
        expect(input).toHaveAttribute("type", "number");
    });

    it("renders with brand border token class by default", () => {
        render(<Input aria-label="field" />);
        const input = screen.getByRole("textbox");
        expect(input.className).toContain("border-gw-border");
    });

    it("renders with chrome2 background token by default", () => {
        render(<Input aria-label="field" />);
        const input = screen.getByRole("textbox");
        expect(input.className).toContain("bg-gw-chrome2");
    });

    it("renders with primary text token by default", () => {
        render(<Input aria-label="field" />);
        const input = screen.getByRole("textbox");
        expect(input.className).toContain("text-gw-primary");
    });

    it("disabled input is not interactable", async () => {
        const onChange = vi.fn();
        render(<Input aria-label="field" disabled onChange={onChange} />);
        const input = screen.getByRole("textbox");
        expect(input).toBeDisabled();
        await userEvent.type(input, "hello");
        expect(onChange).not.toHaveBeenCalled();
    });

    it("caller className is merged with variant classes", () => {
        render(<Input aria-label="field" className="w-full mt-2" />);
        const input = screen.getByRole("textbox");
        expect(input.className).toContain("w-full");
        expect(input.className).toContain("mt-2");
        expect(input.className).toContain("border-gw-border");
    });

    it("forwards ref to the underlying input element", () => {
        const ref = React.createRef<HTMLInputElement>();
        render(<Input ref={ref} aria-label="field" />);
        expect(ref.current).toBeInstanceOf(HTMLInputElement);
    });

    it("forwards aria-label to the input element", () => {
        render(<Input aria-label="project name" />);
        expect(screen.getByRole("textbox", { name: "project name" })).toBeInTheDocument();
    });
});
