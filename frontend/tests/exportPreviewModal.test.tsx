import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ExportPreviewModal from "../components/common/ExportPreviewModal";

describe("ExportPreviewModal", () => {
    it("shows resource name and calls onConfirmExport when Export clicked", () => {
        const onConfirmExport = vi.fn();
        const onClose = vi.fn();

        render(
            <ExportPreviewModal
                isOpen={true}
                resourceTitle={"My Resource"}
                resourceNames={["My Resource"]}
                onConfirmExport={onConfirmExport}
                onClose={onClose}
            />,
        );

        expect(screen.getByText("Export My Resource")).toBeInTheDocument();
        expect(screen.getByText(/Exporting 1 resource/)).toBeInTheDocument();

        const exportBtn = screen.getByText("Export");
        fireEvent.click(exportBtn);

        expect(onConfirmExport).toHaveBeenCalledTimes(1);
    });
});

/**
 * T028: US3 — AppShell parity coverage for ExportPreviewModal.
 *
 * Verifies that the modal lifecycle (close, cancel) is preserved after
 * ShellModalCoordinator extraction.
 */
describe("ExportPreviewModal — AppShell parity (T028)", () => {
    it("calls onClose when the Cancel button is clicked", () => {
        const onClose = vi.fn();

        render(
            <ExportPreviewModal
                isOpen={true}
                resourceTitle={"Chapter One"}
                resourceNames={["Chapter One"]}
                onConfirmExport={vi.fn()}
                onClose={onClose}
            />,
        );

        const cancelBtn = screen.getByText("Cancel");
        fireEvent.click(cancelBtn);

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not render content when isOpen is false", () => {
        render(
            <ExportPreviewModal
                isOpen={false}
                resourceTitle={"Hidden"}
                resourceNames={["Hidden"]}
                onConfirmExport={vi.fn()}
                onClose={vi.fn()}
            />,
        );

        expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
    });
});

describe("ExportPreviewModal — resource list display", () => {
    it("lists resource names for folder export", () => {
        render(
            <ExportPreviewModal
                isOpen={true}
                resourceTitle="Act One"
                resourceNames={["Chapter 01", "Chapter 02"]}
                onConfirmExport={vi.fn()}
                onClose={vi.fn()}
            />,
        );

        expect(screen.getByText(/Chapter 01/)).toBeInTheDocument();
        expect(screen.getByText(/Chapter 02/)).toBeInTheDocument();
        expect(screen.getByText(/Exporting 2 resources/)).toBeInTheDocument();
    });

    it("uses singular label for single resource export", () => {
        render(
            <ExportPreviewModal
                isOpen={true}
                resourceTitle="Chapter 01"
                resourceNames={["Chapter 01"]}
                onConfirmExport={vi.fn()}
                onClose={vi.fn()}
            />,
        );

        expect(screen.getByText(/Exporting 1 resource:/)).toBeInTheDocument();
    });

    it("shows fallback message when resourceNames is empty", () => {
        render(
            <ExportPreviewModal
                isOpen={true}
                resourceTitle="Empty Folder"
                resourceNames={[]}
                onConfirmExport={vi.fn()}
                onClose={vi.fn()}
            />,
        );

        expect(
            screen.getByText("No resources selected for export."),
        ).toBeInTheDocument();
    });
});
