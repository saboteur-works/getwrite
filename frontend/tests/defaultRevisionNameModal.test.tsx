import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DefaultRevisionNameModal from "../components/preferences/DefaultRevisionNameModal";
import { Dialog } from "../components/common/UI/Dialog/Dialog";

function renderInDialog(ui: React.ReactElement) {
    return render(<Dialog open onOpenChange={() => undefined}>{ui}</Dialog>);
}

describe("DefaultRevisionNameModal", () => {
    it("renders with the initial name pre-filled in the input", () => {
        renderInDialog(
            <DefaultRevisionNameModal
                initialName="Initial Draft"
                onClose={vi.fn()}
                onSave={vi.fn().mockResolvedValue(undefined)}
            />,
        );

        const input = screen.getByRole("textbox");
        expect((input as HTMLInputElement).value).toBe("Initial Draft");
    });

    it("calls onSave with the trimmed name and then onClose on success", async () => {
        const onClose = vi.fn();
        const onSave = vi.fn().mockResolvedValue(undefined);

        renderInDialog(
            <DefaultRevisionNameModal
                initialName="Initial Draft"
                onClose={onClose}
                onSave={onSave}
            />,
        );

        const input = screen.getByRole("textbox");
        fireEvent.change(input, { target: { value: "  Scene One  " } });
        fireEvent.click(screen.getByRole("button", { name: /save/i }));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledWith("Scene One");
            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });

    it("calls onClose and does not call onSave when Cancel is clicked", () => {
        const onClose = vi.fn();
        const onSave = vi.fn();

        renderInDialog(
            <DefaultRevisionNameModal
                initialName="Initial Draft"
                onClose={onClose}
                onSave={onSave}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onSave).not.toHaveBeenCalled();
    });

    it("shows a validation error and does not call onSave for an empty input", async () => {
        const onSave = vi.fn();

        renderInDialog(
            <DefaultRevisionNameModal
                initialName="Initial Draft"
                onClose={vi.fn()}
                onSave={onSave}
            />,
        );

        fireEvent.change(screen.getByRole("textbox"), {
            target: { value: "   " },
        });
        fireEvent.click(screen.getByRole("button", { name: /save/i }));

        await waitFor(() => {
            expect(screen.getByText(/cannot be empty/i)).toBeInTheDocument();
            expect(onSave).not.toHaveBeenCalled();
        });
    });

    it("shows a validation error for a name longer than 100 characters", async () => {
        const onSave = vi.fn();

        renderInDialog(
            <DefaultRevisionNameModal
                initialName="Initial Draft"
                onClose={vi.fn()}
                onSave={onSave}
            />,
        );

        fireEvent.change(screen.getByRole("textbox"), {
            target: { value: "a".repeat(101) },
        });
        fireEvent.click(screen.getByRole("button", { name: /save/i }));

        await waitFor(() => {
            expect(screen.getByText(/100 characters/i)).toBeInTheDocument();
            expect(onSave).not.toHaveBeenCalled();
        });
    });

    it("shows an error message when onSave rejects", async () => {
        const onSave = vi
            .fn()
            .mockRejectedValue(new Error("Server error occurred"));

        renderInDialog(
            <DefaultRevisionNameModal
                initialName="Initial Draft"
                onClose={vi.fn()}
                onSave={onSave}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: /save/i }));

        await waitFor(() => {
            expect(
                screen.getByText(/server error occurred/i),
            ).toBeInTheDocument();
        });
    });

    it("disables the Save button while saving is in progress", async () => {
        let resolvePromise!: () => void;
        const onSave = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolvePromise = resolve;
                }),
        );

        renderInDialog(
            <DefaultRevisionNameModal
                initialName="Initial Draft"
                onClose={vi.fn()}
                onSave={onSave}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: /save/i }));

        await waitFor(() => {
            expect(
                screen.getByRole("button", { name: /saving/i }),
            ).toBeDisabled();
        });

        resolvePromise();
    });
});
