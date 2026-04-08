import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import HeadingSettingsModal from "../components/preferences/HeadingSettingsModal";

describe("HeadingSettingsModal", () => {
    it("renders H1 through H3 by default and can add optional levels", () => {
        render(
            <HeadingSettingsModal
                initialHeadings={{}}
                onClose={vi.fn()}
                onSave={vi.fn().mockResolvedValue(undefined)}
            />,
        );

        expect(screen.getByText("H1")).toBeInTheDocument();
        expect(screen.getByText("H2")).toBeInTheDocument();
        expect(screen.getByText("H3")).toBeInTheDocument();
        expect(screen.queryByText("H4")).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /add h4/i }));

        expect(screen.getByText("H4")).toBeInTheDocument();
    });

    it("removes optional heading levels from the draft", () => {
        render(
            <HeadingSettingsModal
                initialHeadings={{
                    h4: { fontSize: "18px" },
                }}
                onClose={vi.fn()}
                onSave={vi.fn().mockResolvedValue(undefined)}
            />,
        );

        expect(screen.getByText("H4")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /remove h4/i }));

        expect(screen.queryByText("H4")).not.toBeInTheDocument();
    });

    it("saves sanitized heading values and closes on success", async () => {
        const onClose = vi.fn();
        const onSave = vi.fn().mockResolvedValue(undefined);

        render(
            <HeadingSettingsModal
                initialHeadings={{}}
                onClose={onClose}
                onSave={onSave}
            />,
        );

        fireEvent.change(screen.getByLabelText("H1 Font Size"), {
            target: { value: "32" },
        });
        fireEvent.click(screen.getByRole("button", { name: /add h4/i }));
        fireEvent.change(
            document.getElementById("h4-fontFamily") as HTMLElement,
            {
                target: { value: "IBM Plex Sans" },
            },
        );
        fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledWith({
                h1: { fontSize: "32px" },
                h4: { fontFamily: "IBM Plex Sans" },
            });
            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });

    it("does not save when cancel is clicked", () => {
        const onClose = vi.fn();
        const onSave = vi.fn();

        render(
            <HeadingSettingsModal
                initialHeadings={{}}
                onClose={onClose}
                onSave={onSave}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onSave).not.toHaveBeenCalled();
    });
});
