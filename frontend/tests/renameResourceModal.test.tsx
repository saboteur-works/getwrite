import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import RenameResourceModal from "../components/ResourceTree/RenameResourceModal";

describe("RenameResourceModal", () => {
    it("renders nothing when isOpen is false", () => {
        const { container } = render(
            <RenameResourceModal isOpen={false} initialName="My Chapter" />,
        );
        expect(container.firstChild).toBeNull();
    });

    it("renders with initialName pre-filled in the input", () => {
        render(<RenameResourceModal isOpen initialName="My Chapter" />);
        const input = screen.getByRole("textbox");
        expect((input as HTMLInputElement).value).toBe("My Chapter");
    });

    it("calls onConfirm with trimmed name and then onClose when Save is clicked", () => {
        const onConfirm = vi.fn();
        const onClose = vi.fn();
        render(
            <RenameResourceModal
                isOpen
                initialName="My Chapter"
                onConfirm={onConfirm}
                onClose={onClose}
            />,
        );
        const input = screen.getByRole("textbox");
        fireEvent.change(input, { target: { value: "  New Title  " } });
        fireEvent.click(screen.getByText("Save"));
        expect(onConfirm).toHaveBeenCalledWith("New Title");
        expect(onClose).toHaveBeenCalled();
    });

    it("does not call onConfirm when name is empty", () => {
        const onConfirm = vi.fn();
        render(
            <RenameResourceModal
                isOpen
                initialName="My Chapter"
                onConfirm={onConfirm}
            />,
        );
        const input = screen.getByRole("textbox");
        fireEvent.change(input, { target: { value: "   " } });
        fireEvent.click(screen.getByText("Save"));
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it("calls onClose when Cancel is clicked", () => {
        const onClose = vi.fn();
        render(<RenameResourceModal isOpen initialName="My Chapter" onClose={onClose} />);
        fireEvent.click(screen.getByText("Cancel"));
        expect(onClose).toHaveBeenCalled();
    });

    it("submits on Enter key press", () => {
        const onConfirm = vi.fn();
        const onClose = vi.fn();
        render(
            <RenameResourceModal
                isOpen
                initialName="My Chapter"
                onConfirm={onConfirm}
                onClose={onClose}
            />,
        );
        const input = screen.getByRole("textbox");
        fireEvent.keyDown(input, { key: "Enter" });
        expect(onConfirm).toHaveBeenCalledWith("My Chapter");
        expect(onClose).toHaveBeenCalled();
    });

    it("calls onClose on Escape key press", () => {
        const onClose = vi.fn();
        render(
            <RenameResourceModal isOpen initialName="My Chapter" onClose={onClose} />,
        );
        const input = screen.getByRole("textbox");
        fireEvent.keyDown(input, { key: "Escape" });
        expect(onClose).toHaveBeenCalled();
    });
});
