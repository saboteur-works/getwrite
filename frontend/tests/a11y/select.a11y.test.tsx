import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Select from "../../components/common/UI/Select/Select";

describe("a11y: Select primitive", () => {
    it("renders a native select element", () => {
        render(
            <Select aria-label="project type">
                <option value="a">Option A</option>
            </Select>,
        );
        expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    it("renders with brand border token class", () => {
        render(<Select aria-label="type"><option value="">Pick</option></Select>);
        const sel = screen.getByRole("combobox");
        expect(sel.className).toContain("border-gw-border");
    });

    it("renders with chrome2 background token", () => {
        render(<Select aria-label="type"><option value="">Pick</option></Select>);
        const sel = screen.getByRole("combobox");
        expect(sel.className).toContain("bg-gw-chrome2");
    });

    it("renders with primary text token", () => {
        render(<Select aria-label="type"><option value="">Pick</option></Select>);
        const sel = screen.getByRole("combobox");
        expect(sel.className).toContain("text-gw-primary");
    });

    it("disabled select is marked as disabled", () => {
        render(
            <Select aria-label="type" disabled>
                <option value="">Pick</option>
            </Select>,
        );
        expect(screen.getByRole("combobox")).toBeDisabled();
    });

    it("caller className is merged with base classes", () => {
        render(
            <Select aria-label="type" className="w-auto">
                <option value="">Pick</option>
            </Select>,
        );
        const sel = screen.getByRole("combobox");
        expect(sel.className).toContain("w-auto");
        expect(sel.className).toContain("border-gw-border");
    });

    it("forwards ref to the underlying select element", () => {
        const ref = React.createRef<HTMLSelectElement>();
        render(
            <Select ref={ref} aria-label="type">
                <option value="">Pick</option>
            </Select>,
        );
        expect(ref.current).toBeInstanceOf(HTMLSelectElement);
    });

    it("forwards aria-label to the select element", () => {
        render(
            <Select aria-label="resource type">
                <option value="">Pick</option>
            </Select>,
        );
        expect(screen.getByRole("combobox", { name: "resource type" })).toBeInTheDocument();
    });
});
