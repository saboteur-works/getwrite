import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ModalOverlayShell from "../components/common/ModalOverlayShell";

describe("ModalOverlayShell", () => {
    it("renders children when isOpen is true", () => {
        render(
            <ModalOverlayShell
                isOpen={true}
                onClose={vi.fn()}
                panelClassName="appshell-modal-panel"
            >
                <span>Modal content</span>
            </ModalOverlayShell>,
        );

        expect(screen.getByText("Modal content")).toBeTruthy();
    });

    it("renders nothing when isOpen is false", () => {
        const { container } = render(
            <ModalOverlayShell
                isOpen={false}
                onClose={vi.fn()}
                panelClassName="appshell-modal-panel"
            >
                <span>Modal content</span>
            </ModalOverlayShell>,
        );

        expect(container.firstChild).toBeNull();
    });

    it("calls onClose when the backdrop is clicked", () => {
        const onClose = vi.fn();
        const { container } = render(
            <ModalOverlayShell
                isOpen={true}
                onClose={onClose}
                panelClassName="appshell-modal-panel"
            >
                <span>Content</span>
            </ModalOverlayShell>,
        );

        const backdrop = container.querySelector(".appshell-modal-backdrop");
        fireEvent.click(backdrop!);

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("applies panelClassName to the panel element", () => {
        const { container } = render(
            <ModalOverlayShell
                isOpen={true}
                onClose={vi.fn()}
                panelClassName="appshell-modal-panel appshell-modal-panel--help"
            >
                <span>Content</span>
            </ModalOverlayShell>,
        );

        const panel = container.querySelector(".appshell-modal-panel--help");
        expect(panel).toBeTruthy();
    });
});
