import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import HelpPage from "../../components/help/HelpPage";

describe("HelpPage", () => {
    it("renders the same tabbed help content and switches sections", async () => {
        const user = userEvent.setup();

        render(<HelpPage />);

        expect(
            screen.getByText(/GetWrite is a web-based writing application/i),
        ).toBeInTheDocument();

        await user.click(screen.getByRole("tab", { name: /Projects/i }));

        const projectsPanel = screen.getByRole("tabpanel", {
            name: /Projects/i,
        });

        expect(
            within(projectsPanel).getByText(
                (_content: string, element: Element | null) => {
                    return (
                        (element?.tagName === "P" &&
                            element?.textContent?.includes(
                                "A project is a self-contained writing workspace",
                            )) ??
                        false
                    );
                },
            ),
        ).toBeInTheDocument();

        expect(
            within(projectsPanel).getByText(
                (_content: string, element: Element | null) => {
                    return (
                        (element?.tagName === "P" &&
                            element?.textContent?.includes(
                                "Workspace folder is always at the top of the tree and cannot be moved, renamed, or deleted.",
                            )) ??
                        false
                    );
                },
            ),
        ).toBeInTheDocument();
    });

    it("keeps the modal close button behavior intact", async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();

        render(<HelpPage renderInModal onClose={onClose} />);

        await user.click(screen.getByRole("button", { name: /Close help/i }));

        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
