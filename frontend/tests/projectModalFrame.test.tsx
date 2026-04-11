import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProjectModalFrame from "../components/common/ProjectModalFrame";

describe("ProjectModalFrame", () => {
    it("renders children", () => {
        render(
            <ProjectModalFrame onClose={vi.fn()}>
                <div className="project-modal-panel">
                    <p>Modal body</p>
                </div>
            </ProjectModalFrame>,
        );

        expect(screen.getByText("Modal body")).toBeTruthy();
    });

    it("calls onClose when the backdrop is clicked", () => {
        const onClose = vi.fn();
        const { container } = render(
            <ProjectModalFrame onClose={onClose}>
                <div className="project-modal-panel">content</div>
            </ProjectModalFrame>,
        );

        const backdrop = container.querySelector(".project-modal-backdrop");
        fireEvent.click(backdrop!);

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("applies role=dialog and aria-modal attributes", () => {
        const { container } = render(
            <ProjectModalFrame onClose={vi.fn()}>
                <div>content</div>
            </ProjectModalFrame>,
        );

        const dialog = container.querySelector("[role='dialog']");
        expect(dialog).toBeTruthy();
        expect(dialog?.getAttribute("aria-modal")).toBe("true");
    });

    it("sets aria-labelledby when ariaLabelledBy prop is provided", () => {
        const { container } = render(
            <ProjectModalFrame onClose={vi.fn()} ariaLabelledBy="my-title">
                <div>content</div>
            </ProjectModalFrame>,
        );

        const dialog = container.querySelector("[role='dialog']");
        expect(dialog?.getAttribute("aria-labelledby")).toBe("my-title");
    });
});
