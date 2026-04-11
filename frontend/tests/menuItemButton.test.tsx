import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MenuItemButton from "../components/common/MenuItemButton";

describe("MenuItemButton", () => {
    it("renders the label", () => {
        render(
            <MenuItemButton icon={<span />} label="Rename" onClick={vi.fn()} />,
        );

        expect(screen.getByText("Rename")).toBeTruthy();
    });

    it("calls onClick when clicked", () => {
        const onClick = vi.fn();
        render(
            <MenuItemButton icon={<span />} label="Delete" onClick={onClick} />,
        );

        fireEvent.click(screen.getByRole("menuitem"));
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("applies danger class when danger prop is true", () => {
        const { container } = render(
            <MenuItemButton
                icon={<span />}
                label="Delete"
                danger
                onClick={vi.fn()}
            />,
        );

        const btn = container.querySelector("button");
        expect(btn?.className).toContain("text-gw-red");
        expect(btn?.className).not.toContain("text-gw-secondary");
    });

    it("uses className override when provided", () => {
        const { container } = render(
            <MenuItemButton
                icon={<span />}
                label="Item"
                className="appshell-topbar-dropdown-item"
                onClick={vi.fn()}
            />,
        );

        const btn = container.querySelector("button");
        expect(btn?.className).toBe("appshell-topbar-dropdown-item");
    });

    it("applies custom role when provided", () => {
        render(
            <MenuItemButton
                icon={<span />}
                label="Toggle"
                role="menuitemcheckbox"
                onClick={vi.fn()}
            />,
        );

        expect(screen.getByRole("menuitemcheckbox")).toBeTruthy();
    });

    it("is disabled when disabled prop is true", () => {
        render(
            <MenuItemButton
                icon={<span />}
                label="Disabled"
                disabled
                onClick={vi.fn()}
            />,
        );

        const btn = screen.getByRole("menuitem") as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
    });
});
