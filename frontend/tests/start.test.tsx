import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StartPage from "../components/Start/StartPage";
import { Provider } from "react-redux";
import { makeStore } from "../src/store/store";
import { createTextResource } from "../src/lib/models/resource";
import { test, vi } from "vitest";
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

test("StartPage opens projects using the root path's directory basename as projectId", async () => {
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

  await user.click(screen.getByRole("button", { name: /Open Open Me/i }));

  // `onOpen` receives the directory basename of `rootPath` (the `projectId`
  // tenant-scoped routes expect), not the absolute `rootPath` — see
  // `selectActiveProjectDirectoryId`'s doc comment in `projectsSlice.ts`.
  expect(onOpen).toHaveBeenCalledWith("proj_open_1");
});

test("StartPage names each project's manage menu after its project", async () => {
  // One manage menu renders per project row and its only content is an
  // aria-hidden icon, so before this it had no accessible name at all — a
  // screen-reader user got a row of identically anonymous buttons.
  const now = new Date().toISOString();
  const projects = ["Alpha", "Beta"].map((name, index) => ({
    project: {
      id: `proj_manage_${index}`,
      name,
      createdAt: now,
      updatedAt: now,
      rootPath: `/tmp/proj_manage_${index}`,
    },
    resources: [],
    folders: [],
  }));

  render(
    <Provider store={makeStore()}>
      <StartPage projects={projects} />
    </Provider>,
  );

  expect(
    screen.getByRole("button", { name: "Manage Alpha" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Manage Beta" }),
  ).toBeInTheDocument();
});

test("StartPage's create buttons are named by their own visible text", () => {
  // WCAG 2.5.3 Label in Name: the empty-state button reads "Create the first
  // project" but carried aria-label="Start a new project", so its accessible
  // name contained none of its visible text — a speech-input user saying what
  // they could see could not activate it. Both buttons now take their name
  // from their label.
  render(
    <Provider store={makeStore()}>
      <StartPage projects={[]} />
    </Provider>,
  );

  const create = screen.getByRole("button", {
    name: "Create the first project",
  });
  expect(create).toBeInTheDocument();
  expect(create).not.toHaveAttribute("aria-label");
});
