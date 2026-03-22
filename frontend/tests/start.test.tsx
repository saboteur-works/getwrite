import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StartPage from "../components/Start/StartPage";
import { Provider } from "react-redux";
import { makeStore } from "../src/store/store";
import { createTextResource } from "../src/lib/models/resource";
import { test } from "vitest";
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
                rootPath: "/tmp/proj_start_1",
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
                rootPath: "/tmp/proj_start_2",
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
    const store = makeStore();
    render(
        <Provider store={store}>
            <StartPage projects={projects} />
        </Provider>,
    );

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

test("StartPage opens projects using the project root path when available", async () => {
    const user = userEvent.setup();
    const now = new Date().toISOString();
    const onOpen = vi.fn();
    const projects = [
        {
            project: {
                id: "proj_open_1",
                name: "Open Me",
                createdAt: now,
                updatedAt: now,
                rootPath: "/tmp/proj_open_1",
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
    ];

    const store = makeStore();
    render(
        <Provider store={store}>
            <StartPage projects={projects} onOpen={onOpen} />
        </Provider>,
    );

    await user.click(screen.getByRole("button", { name: /Open Project/i }));

    expect(onOpen).toHaveBeenCalledWith("/tmp/proj_open_1");
});
