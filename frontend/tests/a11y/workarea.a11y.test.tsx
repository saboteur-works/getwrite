import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ViewSwitcher from "../../components/WorkArea/ViewSwitcher";

describe("a11y: WorkArea view switcher keyboard navigation (T036)", () => {
    it("exposes tab semantics and skips disabled views on click activation", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();

        render(
            <ViewSwitcher
                view="edit"
                onChange={onChange}
                disabledViews={["diff"]}
            />,
        );

        const tablist = screen.getByRole("tablist", {
            name: /Work area views/i,
        });
        expect(tablist).toBeInTheDocument();

        const editTab = screen.getByRole("tab", { name: /Edit/i });
        const diffTab = screen.getByRole("tab", { name: /Diff/i });

        expect(editTab).toHaveAttribute("aria-selected", "true");
        expect(diffTab).toHaveAttribute("aria-disabled", "true");

        await user.click(diffTab);
        expect(onChange).not.toHaveBeenCalled();
    });

    it("supports arrow-key navigation across work area tabs", async () => {
        const user = userEvent.setup();

        function Harness(): JSX.Element {
            const [view, setView] = React.useState<
                "edit" | "organizer" | "data" | "diff" | "timeline"
            >("edit");

            return <ViewSwitcher view={view} onChange={setView} />;
        }

        render(<Harness />);

        const editTab = screen.getByRole("tab", { name: /Edit/i });
        editTab.focus();

        await user.keyboard("{ArrowRight}");
        expect(screen.getByRole("tab", { name: /Organizer/i })).toHaveFocus();
        expect(screen.getByRole("tab", { name: /Organizer/i })).toHaveAttribute(
            "aria-selected",
            "true",
        );

        await user.keyboard("{End}");
        expect(screen.getByRole("tab", { name: /Timeline/i })).toHaveFocus();
        expect(screen.getByRole("tab", { name: /Timeline/i })).toHaveAttribute(
            "aria-selected",
            "true",
        );
    });
});
