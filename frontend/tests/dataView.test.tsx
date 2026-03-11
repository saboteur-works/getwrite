import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DataView from "../components/WorkArea/DataView";
import { createTextResource } from "../src/lib/models/resource";
import type { Project, TextResource } from "../src/lib/models/types";

describe("DataView", () => {
    it("shows project/resource counts and lists resources", () => {
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

        // Explicit stat checks
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

        expect(getStatValue("Projects")).toBe(String(projects.length));
        expect(getStatValue("Resources")).toBe(String(resources.length));

        // Resources list contains sample titles (appear at least once)
        resources.forEach((r) => {
            expect(screen.getAllByText(r.name).length).toBeGreaterThanOrEqual(
                1,
            );
        });
    });
});
it("shows project/resource counts and lists resources for a single project", () => {
    const now = new Date().toISOString();
    const projects: Project[] = [
        {
            id: "proj_single",
            name: "Single Project",
            createdAt: now,
            updatedAt: now,
        },
    ];
    const resources: TextResource[] = [
        createTextResource({
            name: "S1",
            plainText: "Single content",
            folderId: null,
        } as any),
    ];
    const project = projects[0];
    render(<DataView project={project} resources={resources} />);

    // Explicit stat checks for single project
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

    expect(getStatValue("Projects")).toBe(String(projects.length));
    expect(getStatValue("Resources")).toBe(String(resources.length));

    // Resources list contains sample titles from the single project
    resources.forEach((r) => {
        expect(screen.getAllByText(r.name).length).toBeGreaterThanOrEqual(1);
    });
});
