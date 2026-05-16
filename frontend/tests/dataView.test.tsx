import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DataView from "../components/WorkArea/DataView";
import { createTextResource } from "../src/lib/models/resource";
import type { Project, TextResource } from "../src/lib/models/types";

describe("DataView", () => {
    it("shows resource count and lists resources", () => {
        const now = new Date().toISOString();
        const projects: Project[] = [
            {
                id: "proj_a",
                name: "Project A",
                createdAt: now,
                updatedAt: now,
            },
            {
                id: "proj_b",
                name: "Project B",
                createdAt: now,
                updatedAt: now,
            },
        ];
        const resources: TextResource[] = [
            createTextResource({
                name: "A1",
                plainText: "Content A1",
                folderId: null,
            } as any),
            createTextResource({
                name: "B1",
                plainText: "Content B1",
                folderId: null,
            } as any),
        ];

        render(<DataView projects={projects} resources={resources} />);

        const getStatValue = (label: string) => {
            const matches = screen.getAllByText(label, { exact: false });
            const statLabel = matches.find((el: HTMLElement) => {
                const parent = el.parentElement;
                return Boolean(parent && parent.querySelector(".text-xl"));
            });
            if (!statLabel) return null;
            const parent = statLabel.parentElement as HTMLElement | null;
            const valueEl = parent?.querySelector(".text-xl");
            return valueEl ? (valueEl.textContent?.trim() ?? null) : null;
        };

        expect(getStatValue("Resources")).toBe(String(resources.length));

        resources.forEach((r) => {
            expect(screen.getAllByText(r.name).length).toBeGreaterThanOrEqual(1);
        });
    });
});

it("shows resource count and lists resources for a single project", () => {
    const now = new Date().toISOString();
    const project: Project = {
        id: "proj_single",
        name: "Single Project",
        createdAt: now,
        updatedAt: now,
    };
    const resources: TextResource[] = [
        createTextResource({
            name: "S1",
            plainText: "Single content",
            folderId: null,
        } as any),
    ];

    render(<DataView project={project} resources={resources} />);

    const getStatValue = (label: string) => {
        const matches = screen.getAllByText(label, { exact: false });
        const statLabel = matches.find((el: HTMLElement) => {
            const parent = el.parentElement;
            return Boolean(parent && parent.querySelector(".text-xl"));
        });
        if (!statLabel) return null;
        const parent = statLabel.parentElement as HTMLElement | null;
        const valueEl = parent?.querySelector(".text-xl");
        return valueEl ? (valueEl.textContent?.trim() ?? null) : null;
    };

    expect(getStatValue("Resources")).toBe(String(resources.length));

    resources.forEach((r) => {
        expect(screen.getAllByText(r.name).length).toBeGreaterThanOrEqual(1);
    });
});

describe("DataView word count goal", () => {
    const now = new Date().toISOString();

    it("renders a progress bar when project has wordCountGoal > 0", () => {
        const project: Project = {
            id: "proj_goal",
            name: "Goal Project",
            createdAt: now,
            config: {
                wordCountGoal: 80000,
                editorConfig: { headings: {} },
            },
        };
        render(<DataView project={project} resources={[]} />);
        expect(screen.getByRole("progressbar")).toBeDefined();
    });

    it("does not render a progress bar when project has no wordCountGoal", () => {
        const project: Project = {
            id: "proj_no_goal",
            name: "No Goal Project",
            createdAt: now,
            config: {
                editorConfig: { headings: {} },
            },
        };
        render(<DataView project={project} resources={[]} />);
        expect(screen.queryByRole("progressbar")).toBeNull();
    });

    it("does not render a progress bar when wordCountGoal is 0", () => {
        const project: Project = {
            id: "proj_zero_goal",
            name: "Zero Goal Project",
            createdAt: now,
            config: {
                wordCountGoal: 0,
                editorConfig: { headings: {} },
            },
        };
        render(<DataView project={project} resources={[]} />);
        expect(screen.queryByRole("progressbar")).toBeNull();
    });

    it("does not render a progress bar when project has no config", () => {
        const project: Project = {
            id: "proj_no_config",
            name: "No Config Project",
            createdAt: now,
        };
        render(<DataView project={project} resources={[]} />);
        expect(screen.queryByRole("progressbar")).toBeNull();
    });
});
