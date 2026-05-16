import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ResourceBreakdown, {
    type ResourceGroup,
} from "../components/WorkArea/ResourceBreakdown";

const makeGroup = (
    label: string,
    resourceCount: number,
    wordCount: number,
): ResourceGroup => ({ label, resourceCount, wordCount });

describe("ResourceBreakdown", () => {
    it("renders nothing when groups is empty", () => {
        const { container } = render(<ResourceBreakdown groups={[]} />);
        expect(container.firstChild).toBeNull();
    });

    it("renders nothing when groups has exactly 1 item", () => {
        const { container } = render(
            <ResourceBreakdown groups={[makeGroup("Chapters", 3, 9200)]} />,
        );
        expect(container.firstChild).toBeNull();
    });

    it("renders the Breakdown section title when there are 2+ groups", () => {
        render(
            <ResourceBreakdown
                groups={[
                    makeGroup("Chapters", 3, 9200),
                    makeGroup("Research", 2, 3400),
                ]}
            />,
        );
        expect(screen.getByText("Breakdown")).toBeDefined();
    });

    it("renders one list item per group", () => {
        render(
            <ResourceBreakdown
                groups={[
                    makeGroup("Act One", 4, 12400),
                    makeGroup("Act Two", 8, 28100),
                    makeGroup("Act Three", 3, 9300),
                ]}
            />,
        );
        expect(screen.getAllByRole("listitem")).toHaveLength(3);
    });

    it("renders each group label", () => {
        render(
            <ResourceBreakdown
                groups={[
                    makeGroup("Chapters", 5, 18700),
                    makeGroup("Research", 2, 4100),
                    makeGroup("Ungrouped", 1, 200),
                ]}
            />,
        );
        expect(screen.getByText("Chapters")).toBeDefined();
        expect(screen.getByText("Research")).toBeDefined();
        expect(screen.getByText("Ungrouped")).toBeDefined();
    });

    it("renders resource count and word count with dot separator", () => {
        render(
            <ResourceBreakdown
                groups={[
                    makeGroup("Chapters", 3, 9200),
                    makeGroup("Research", 2, 3400),
                ]}
            />,
        );
        expect(screen.getByText(/3 resources/)).toBeDefined();
        expect(screen.getByText(/9,200 words/)).toBeDefined();
        expect(screen.getByText(/2 resources/)).toBeDefined();
        expect(screen.getByText(/3,400 words/)).toBeDefined();
    });

    it("uses singular 'resource' when resourceCount is 1", () => {
        render(
            <ResourceBreakdown
                groups={[
                    makeGroup("Prologue", 1, 450),
                    makeGroup("Epilogue", 1, 300),
                ]}
            />,
        );
        const items = screen.getAllByRole("listitem");
        expect(items[0].textContent).toContain("1 resource");
        expect(items[0].textContent).not.toContain("1 resources");
    });

    it("renders correctly at the boundary of exactly 2 groups", () => {
        render(
            <ResourceBreakdown
                groups={[
                    makeGroup("Alpha", 2, 1000),
                    makeGroup("Beta", 3, 2000),
                ]}
            />,
        );
        expect(screen.getByText("Breakdown")).toBeDefined();
        expect(screen.getAllByRole("listitem")).toHaveLength(2);
    });
});
