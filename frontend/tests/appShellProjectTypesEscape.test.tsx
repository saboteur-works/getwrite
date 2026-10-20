import { describe, it, expect, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

vi.mock("../components/TipTapEditor", () => ({
  __esModule: true,
  default: () => <textarea data-testid="tiptap-mock" />,
}));

vi.mock("../src/lib/api/project-types", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/api/project-types")>();
  return {
    ...actual,
    listProjectTypeEntries: vi.fn(async () => ({
      entries: [
        {
          fileName: "mine.json",
          source: "saved" as const,
          spec: {
            id: "mine",
            name: "Mine",
            description: "",
            folders: [{ name: "Workspace" }],
          },
        },
      ],
      unusable: [],
      savedStatus: "ok" as const,
    })),
  };
});

import AppShell from "../components/Layout/AppShell";
import { makeStore } from "../src/store/store";
import { setupAppShellFetchStub } from "./helpers/appShellFetchStub";
import { flushPendingEffects } from "./helpers/flushEffects";

/**
 * Feature 90, Task 35 (F-7). The manager is opened the way the app opens it
 * (settings menu inside AppShell, which mounts ShellModalCoordinator and the
 * manager's close guard). AppShell also listens for Escape on the document,
 * so a test that mounts the coordinator alone cannot see what Escape does to
 * the manager in the real shell.
 */
async function openManagerWithUnsavedEdit(): Promise<HTMLElement> {
  render(
    <Provider store={makeStore()}>
      <AppShell showSidebars={false} project={null} resources={[]} />
    </Provider>,
  );
  await flushPendingEffects();
  fireEvent.click(
    screen.getByRole("button", { name: "Open project settings menu" }),
  );
  fireEvent.click(
    screen.getByRole("menuitem", { name: "Project Type Manager" }),
  );
  const name = await screen.findByLabelText("Name");
  fireEvent.change(name, { target: { value: "Mine edited" } });
  name.focus();
  return name;
}

describe("AppShell: Escape on the Project Type Manager with unsaved edits (F-7)", () => {
  setupAppShellFetchStub();

  it("Escape on the manager opens the prompt, keeps the manager open and keeps the draft", async () => {
    const name = await openManagerWithUnsavedEdit();
    fireEvent.keyDown(name, { key: "Escape" });

    expect(
      await screen.findByRole("dialog", { name: /unsaved changes/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: /project type management/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Mine edited");
  });

  it("Escape on the prompt closes only the prompt: the manager stays open with the draft", async () => {
    await openManagerWithUnsavedEdit();
    // Opened with the Close button, as in the measured packaged run.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    const prompt = await screen.findByRole("dialog", {
      name: /unsaved changes/i,
    });

    // Focus sits on the prompt's "Keep editing" button when it opens.
    const keepEditing = within(prompt).getByRole("button", {
      name: "Keep editing",
    });
    await waitFor(() => expect(document.activeElement).toBe(keepEditing));
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /unsaved changes/i }),
      ).toBeNull(),
    );
    expect(
      screen.getByRole("dialog", { name: /project type management/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Mine edited");
  });

  it("Escape on the manager with no edits still closes it", async () => {
    render(
      <Provider store={makeStore()}>
        <AppShell showSidebars={false} project={null} resources={[]} />
      </Provider>,
    );
    await flushPendingEffects();
    fireEvent.click(
      screen.getByRole("button", { name: "Open project settings menu" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Project Type Manager" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: /project type management/i,
    });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
