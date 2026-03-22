import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CompilePreviewModal from "../components/common/CompilePreviewModal";
import type { AnyResource } from "../src/lib/models/types";

describe("CompilePreviewModal", () => {
    it("renders preview and calls onConfirm", () => {
        const onConfirm = vi.fn();
        const onClose = vi.fn();

        const resource: AnyResource = {
            id: "r1",
            name: "Test Doc",
            type: "text",
            plainText: "",
            createdAt: "",
            updatedAt: "",
            metadata: {},
        };

        render(
            <CompilePreviewModal
                isOpen={true}
                resource={resource}
                resources={[]}
                onClose={onClose}
                onConfirm={onConfirm}
            />,
        );

        expect(screen.getByText("Compile Preview")).toBeInTheDocument();
        const textarea = screen.getByLabelText(
            "compile-preview",
        ) as HTMLTextAreaElement;
        expect(textarea.value).toContain("Test Doc");

        const confirmBtn = screen.getByText("Confirm");
        fireEvent.click(confirmBtn);

        expect(onConfirm).toHaveBeenCalledTimes(1);
    });
});

/**
 * T028: US3 — AppShell parity coverage for CompilePreviewModal.
 *
 * Verifies that the close lifecycle is preserved after ShellModalCoordinator
 * extraction.
 */
describe("CompilePreviewModal — AppShell parity (T028)", () => {
    it("calls onClose when the Cancel button is clicked", () => {
        const onClose = vi.fn();

        render(
            <CompilePreviewModal
                isOpen={true}
                resource={undefined}
                resources={[]}
                onClose={onClose}
                onConfirm={vi.fn()}
            />,
        );

        const closeBtn = screen.getByRole("button", { name: /close/i });
        fireEvent.click(closeBtn);

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not render when isOpen is false", () => {
        render(
            <CompilePreviewModal
                isOpen={false}
                resource={undefined}
                resources={[]}
                onClose={vi.fn()}
                onConfirm={vi.fn()}
            />,
        );

        expect(screen.queryByText("Compile Preview")).not.toBeInTheDocument();
    });
});
