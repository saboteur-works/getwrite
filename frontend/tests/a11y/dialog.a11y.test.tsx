import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogHeader,
    DialogFooter,
} from "../../components/common/UI/Dialog/Dialog";
import Button from "../../components/common/UI/Button/Button";

function SimpleDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Test Dialog</DialogTitle>
                    <DialogDescription>Dialog description.</DialogDescription>
                </DialogHeader>
                <p>Dialog body content</p>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button variant="destructive">Confirm</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

describe("a11y: Dialog primitive", () => {
    it("renders content when open=true", () => {
        render(<SimpleDialog open={true} onOpenChange={vi.fn()} />);
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByText("Test Dialog")).toBeInTheDocument();
        expect(screen.getByText("Dialog body content")).toBeInTheDocument();
    });

    it("does not render content when open=false", () => {
        render(<SimpleDialog open={false} onOpenChange={vi.fn()} />);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.queryByText("Test Dialog")).not.toBeInTheDocument();
    });

    it("dialog has role=dialog", () => {
        render(<SimpleDialog open={true} onOpenChange={vi.fn()} />);
        const dialog = screen.getByRole("dialog");
        expect(dialog).toBeInTheDocument();
    });

    it("dialog element has role=dialog (aria-modal is managed by Radix at runtime)", () => {
        render(<SimpleDialog open={true} onOpenChange={vi.fn()} />);
        const dialog = screen.getByRole("dialog");
        expect(dialog).toBeInTheDocument();
        expect(dialog.getAttribute("role")).toBe("dialog");
    });

    it("DialogTitle is associated with the dialog via aria-labelledby", () => {
        render(<SimpleDialog open={true} onOpenChange={vi.fn()} />);
        const dialog = screen.getByRole("dialog");
        const labelledBy = dialog.getAttribute("aria-labelledby");
        expect(labelledBy).toBeTruthy();
        const title = document.getElementById(labelledBy!);
        expect(title?.textContent).toBe("Test Dialog");
    });

    it("DialogDescription is associated with the dialog via aria-describedby", () => {
        render(<SimpleDialog open={true} onOpenChange={vi.fn()} />);
        const dialog = screen.getByRole("dialog");
        const describedBy = dialog.getAttribute("aria-describedby");
        expect(describedBy).toBeTruthy();
        const desc = document.getElementById(describedBy!);
        expect(desc?.textContent).toBe("Dialog description.");
    });

    it("calls onOpenChange(false) when Escape is pressed", () => {
        const onOpenChange = vi.fn();
        render(<SimpleDialog open={true} onOpenChange={onOpenChange} />);
        fireEvent.keyDown(document, { key: "Escape" });
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("renders DialogHeader, body, and DialogFooter", () => {
        render(<SimpleDialog open={true} onOpenChange={vi.fn()} />);
        expect(screen.getByText("Test Dialog")).toBeInTheDocument();
        expect(screen.getByText("Dialog body content")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    });

    it("topAlign variant positions the panel at the top", () => {
        render(
            <Dialog open={true} onOpenChange={vi.fn()}>
                <DialogContent topAlign>
                    <DialogTitle>Palette</DialogTitle>
                    <p>Search content</p>
                </DialogContent>
            </Dialog>,
        );
        const dialog = screen.getByRole("dialog");
        expect(dialog.className).toContain("top-[8%]");
        expect(dialog.className).not.toContain("-translate-y-1/2");
    });

    it("maxWidth prop overrides default panel width", () => {
        render(
            <Dialog open={true} onOpenChange={vi.fn()}>
                <DialogContent maxWidth="max-w-[480px]">
                    <DialogTitle>Narrow Dialog</DialogTitle>
                </DialogContent>
            </Dialog>,
        );
        const dialog = screen.getByRole("dialog");
        expect(dialog.className).toContain("max-w-[480px]");
    });
});
