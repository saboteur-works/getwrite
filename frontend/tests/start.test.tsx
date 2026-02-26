import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StartPage from "../components/Start/StartPage";
import { createTextResource } from "../src/lib/models/resource";

test("StartPage renders projects and opens CreateProjectModal", async () => {
    const user = userEvent.setup();
    const now = new Date().toISOString();
    const projects = [
        {
            project: {
                id: "proj_start_1",
                name: "Start Project 1",
                createdAt: now,
                updatedAt: now,
                rootPath: null,
            },
            resources: [
                createTextResource({
                    name: "Doc 1",
                    plainText: "Doc 1",
                    folderId: null,
                } as any),
            ],
            folders: [],
        },
        {
            project: {
                id: "proj_start_2",
                name: "Start Project 2",
                createdAt: now,
                updatedAt: now,
                rootPath: null,
            },
            resources: [
                createTextResource({
                    name: "Doc 2",
                    plainText: "Doc 2",
                    folderId: null,
                } as any),
            ],
            folders: [],
        },
    ];
    render(<StartPage projects={projects} />);

    // heading
    expect(
        screen.getByRole("heading", { name: /Projects/i }),
    ).toBeInTheDocument();

    // project cards render
    const cards = screen.getAllByRole("article");
    expect(cards.length).toBeGreaterThanOrEqual(1);

    // open modal
    const newButton = screen.getByRole("button", { name: /New Project/i });
    await user.click(newButton);

    // modal should be visible
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Create Project/i)).toBeInTheDocument();
});
