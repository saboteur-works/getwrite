import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import HelpPage from "../../components/help/HelpPage";

describe("a11y: HelpPage keyboard navigation (T041)", () => {
    it("renders the modal variant with dialog semantics and Escape dismissal", async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();

        render(<HelpPage renderInModal onClose={onClose} />);

        const dialog = screen.getByRole("dialog", {
            name: /Help & Documentation/i,
        });
        expect(dialog).toHaveAttribute("aria-modal", "true");

        await waitFor(() => {
            expect(
                screen.getByRole("button", { name: /Close help/i }),
            ).toHaveFocus();
        });

        await user.keyboard("{Escape}");
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("exposes tablist and tabpanel relationships for help sections", () => {
        render(<HelpPage renderInModal onClose={vi.fn()} />);

        expect(
            screen.getByRole("tablist", { name: /Help sections/i }),
        ).toBeInTheDocument();

        const activeTab = screen.getByRole("tab", { name: /Getting Started/i });
        const tabPanel = screen.getByRole("tabpanel");

        expect(activeTab).toHaveAttribute("aria-selected", "true");
        expect(tabPanel).toHaveAttribute(
            "aria-labelledby",
            activeTab.getAttribute("id"),
        );
    });
});
