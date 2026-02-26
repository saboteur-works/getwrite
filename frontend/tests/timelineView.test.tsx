import React from "react";
import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TimelineView from "../components/WorkArea/TimelineView";
import { createTextResource } from "../src/lib/models/resource";

describe("TimelineView", () => {
    test("renders dated sections and undated section", () => {
        const now = new Date().toISOString();
        const projectId = "proj_timeline_1";
        const projects = [
            {
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
            },
        ];

        const project = projects[0];
        render(<TimelineView project={project} />);

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
