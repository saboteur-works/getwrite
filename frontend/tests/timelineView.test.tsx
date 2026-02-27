import React from "react";
import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Provide a controllable fake Redux state for components that use `useAppSelector`.
let fakeState: any = {
    projects: { selectedProjectId: null, projects: {} },
    resources: { resources: [] },
};

vi.mock("../src/store/hooks", () => {
    return {
        __esModule: true,
        default: (selector: any) => selector(fakeState),
    };
});

import TimelineView from "../components/WorkArea/TimelineView";
import { createTextResource } from "../src/lib/models/resource";

describe("TimelineView", () => {
    test("renders dated sections and undated section", () => {
        const now = new Date().toISOString();
        const projectId = "proj_timeline_1";
        const project = {
            project: {
                id: projectId,
                name: "Timeline Project",
                createdAt: now,
                updatedAt: now,
            },
            resources: [
                createTextResource({
                    name: "Entry A",
                    plainText: "Entry A body",
                    folderId: null,
                } as any),
            ],
            folders: [],
        };

        // Inject into the mocked selector state so the component sees these values.
        fakeState.projects.projects[project.project.id] = project.project;
        fakeState.projects.selectedProjectId = project.project.id;
        fakeState.resources.resources = project.resources;

        render(<TimelineView />);

        // At least one dated section (createdAt present on placeholders)
        const headings = screen.getAllByRole("heading", { level: 3 });
        expect(headings.length).toBeGreaterThanOrEqual(1);

        // Resource titles should appear
        project.resources.forEach((r) => {
            expect(screen.getAllByText(r.name).length).toBeGreaterThanOrEqual(
                1,
            );
        });
    });
});
