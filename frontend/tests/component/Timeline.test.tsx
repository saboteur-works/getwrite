import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Timeline } from "../../components/Timeline";
import type { TimelineItem, TimelineGroup } from "../../components/Timeline";

const makeItem = (
    id: string,
    label: string,
    startDate: string,
    overrides: Partial<TimelineItem> = {},
): TimelineItem => ({ id, label, startDate, ...overrides });

describe("Timeline", () => {
    it("renders a chip for each item", () => {
        const items: TimelineItem[] = [
            makeItem("1", "Chapter One", "2024-01-01"),
            makeItem("2", "Chapter Two", "2024-02-01"),
            makeItem("3", "Chapter Three", "2024-03-01"),
        ];
        render(<Timeline items={items} />);
        expect(screen.getAllByRole("listitem")).toHaveLength(3);
    });

    it("each chip has an aria-label matching its item label", () => {
        const items: TimelineItem[] = [
            makeItem("1", "Scene One", "2024-01-01"),
            makeItem("2", "Scene Two", "2024-02-15"),
        ];
        render(<Timeline items={items} />);
        expect(screen.getByRole("listitem", { name: "Scene One" })).toBeInTheDocument();
        expect(screen.getByRole("listitem", { name: "Scene Two" })).toBeInTheDocument();
    });

    it("calls item onClick with the item id when clicked", async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        const items: TimelineItem[] = [
            makeItem("abc", "Clickable Scene", "2024-04-01", { onClick }),
        ];
        render(<Timeline items={items} />);
        await user.click(screen.getByRole("listitem", { name: "Clickable Scene" }));
        expect(onClick).toHaveBeenCalledWith("abc");
    });

    it("renders group labels when groups are provided", () => {
        const groups: TimelineGroup[] = [
            { id: "g1", label: "Act One" },
            { id: "g2", label: "Act Two" },
        ];
        const items: TimelineItem[] = [
            makeItem("1", "Scene A", "2024-01-01", { groupId: "g1" }),
            makeItem("2", "Scene B", "2024-02-01", { groupId: "g2" }),
        ];
        render(<Timeline items={items} groups={groups} />);
        expect(screen.getByText("Act One")).toBeInTheDocument();
        expect(screen.getByText("Act Two")).toBeInTheDocument();
    });

    it("renders without crashing when items is empty", () => {
        const { container } = render(<Timeline items={[]} />);
        expect(container.firstChild).toBeTruthy();
    });

    it("renders the correct number of axis ticks", () => {
        const items: TimelineItem[] = [makeItem("1", "Scene", "2024-01-01")];
        render(
            <Timeline
                items={items}
                config={{ tickCount: 5, locale: "en-US" }}
            />,
        );
        // Each tick renders a label span with a formatted date
        // The axis renders within the scrollable container; we query for tick content via the axis structure
        const axisContainer = document.querySelector(
            '[style*="border-bottom"]',
        ) as HTMLElement;
        expect(axisContainer).toBeTruthy();
        // 5 ticks → 5 label spans inside the axis
        const ticks = axisContainer.querySelectorAll("span:first-child");
        expect(ticks).toHaveLength(5);
    });

    it("renders zoom in and zoom out controls", () => {
        render(<Timeline items={[makeItem("1", "Scene", "2024-01-01")]} />);
        expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Zoom out" })).toBeInTheDocument();
    });

    it("zoom out button is disabled at minimum zoom (100%)", () => {
        render(<Timeline items={[makeItem("1", "Scene", "2024-01-01")]} />);
        const zoomOut = screen.getByRole("button", { name: "Zoom out" });
        expect(zoomOut).toBeDisabled();
    });

    it("zoom in button is disabled at maximum zoom", async () => {
        const user = userEvent.setup();
        render(
            <Timeline
                items={[makeItem("1", "Scene", "2024-01-01")]}
                config={{ initialZoom: 10 }}
            />,
        );
        const zoomIn = screen.getByRole("button", { name: "Zoom in" });
        expect(zoomIn).toBeDisabled();
    });

    it("clicking zoom in increments the zoom level", async () => {
        const user = userEvent.setup();
        render(<Timeline items={[makeItem("1", "Scene", "2024-01-01")]} />);
        const zoomIn = screen.getByRole("button", { name: "Zoom in" });
        await user.click(zoomIn);
        expect(screen.getByText("150%")).toBeInTheDocument();
    });

    it("items without a groupId render in an ungrouped row when groups are provided", () => {
        const groups: TimelineGroup[] = [{ id: "g1", label: "Characters" }];
        const items: TimelineItem[] = [
            makeItem("1", "Grouped", "2024-01-01", { groupId: "g1" }),
            makeItem("2", "Ungrouped", "2024-02-01"),
        ];
        render(<Timeline items={items} groups={groups} />);
        expect(screen.getByRole("listitem", { name: "Grouped" })).toBeInTheDocument();
        expect(screen.getByRole("listitem", { name: "Ungrouped" })).toBeInTheDocument();
    });
});
