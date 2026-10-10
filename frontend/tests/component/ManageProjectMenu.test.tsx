/**
 * Feature 77 Task 18 (FR-24): the project Delete menu item is disabled with a
 * visible, described reason only when the paired caller's `projectDeletion`
 * limit is on.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import ManageProjectMenu from "../../components/Start/ManageProjectMenu";
import { makeStore } from "../../src/store/store";
import { selectProject, setProjects } from "../../src/store/projectsSlice";
import { toastService } from "../../src/lib/toast-service";
import {
  PROJECT_DELETION_LIMITED_REASON,
  PROJECT_NOT_DELETED,
} from "../../components/Sharing/sharing-copy";
import { LIMITS_CASES } from "../helpers/sharingLimitsMock";

const mocks = vi.hoisted(() => ({
  state: { state: "exempt" } as { state: string },
  refresh: vi.fn(),
}));

vi.mock("../../components/Sharing/SharingLimitsContext", () => ({
  useSharingLimits: () => ({
    state: mocks.state,
    hasDesktopBridge: false,
    refresh: mocks.refresh,
    registerUnlockPrompt: () => () => undefined,
  }),
}));

async function openMenu() {
  const user = userEvent.setup();
  render(
    <Provider store={makeStore()}>
      <ManageProjectMenu projectId="p1" projectName="Novel" />
    </Provider>,
  );
  await user.click(screen.getByRole("button", { name: "Manage Novel" }));
  return user;
}

beforeEach(() => {
  mocks.refresh.mockReset();
});

describe("ManageProjectMenu Delete under paired-device limits", () => {
  it.each(LIMITS_CASES)("Delete in state $name", async ({ state, limited }) => {
    mocks.state = state;
    await openMenu();
    const del = screen.getByRole("menuitem", { name: "Delete" });
    const rename = screen.getByRole("menuitem", { name: "Rename" });
    expect(rename).toBeEnabled();
    if (limited("projectDeletion")) {
      expect(del).toBeDisabled();
      const reason = screen.getByText(PROJECT_DELETION_LIMITED_REASON);
      expect(del.getAttribute("aria-describedby")).toBe(reason.id);
      expect(reason.className).not.toMatch(/red/);
      expect(reason.getAttribute("role")).not.toBe("alert");
    } else {
      expect(del).toBeEnabled();
      expect(del.getAttribute("aria-describedby")).toBeNull();
      expect(
        screen.queryByText(PROJECT_DELETION_LIMITED_REASON),
      ).not.toBeInTheDocument();
    }
  });

  it("the reason is plain text in the DOM, reachable by reading order (a disabled button is not focusable)", async () => {
    mocks.state = LIMITS_CASES[3].state;
    await openMenu();
    const del = screen.getByRole("menuitem", { name: "Delete" });
    const reason = screen.getByText(PROJECT_DELETION_LIMITED_REASON);
    expect(
      del.compareDocumentPosition(reason) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

// Feature 77 Task 20 (FR-25): deletion waits for the server.
describe("ManageProjectMenu delete waits for the server", () => {
  const DIR_ID = "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  function renderWithProject(onDelete: (id: string) => void) {
    const store = makeStore();
    store.dispatch(
      setProjects([
        {
          project: {
            id: "p1",
            name: "Novel",
            rootPath: `/tmp/projects/${DIR_ID}`,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          folders: [],
          resources: [],
        },
      ]),
    );
    render(
      <Provider store={store}>
        <ManageProjectMenu
          projectId="p1"
          projectName="Novel"
          onDelete={onDelete}
        />
      </Provider>,
    );
    return store;
  }

  async function openDeleteDialog() {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Manage Novel" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    return user;
  }

  beforeEach(() => {
    mocks.state = { state: "exempt" };
    vi.spyOn(toastService, "success").mockReturnValue("");
    vi.spyOn(toastService, "error").mockReturnValue("");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("on a 403 refusal keeps the project, the dialog and the list, shows the server's text, refreshes limits, and never says Project deleted", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "Server says no.", limit: "projectDeletion" }),
        { status: 403 },
      ),
    );
    const onDelete = vi.fn();
    const store = renderWithProject(onDelete);
    const user = await openDeleteDialog();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    const failure = await screen.findByText(/Server says no\./);
    expect(failure.textContent).toContain(PROJECT_NOT_DELETED);
    expect(failure.className).not.toMatch(/red/);
    expect(failure.getAttribute("role")).not.toBe("alert");
    expect(
      screen.getByRole("heading", { name: "Delete project" }),
    ).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    expect(selectProject(store.getState(), "p1")).toBeDefined();
    expect(toastService.success).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("on a generic 500 shows the failure with its message, keeps the project, and does not refresh limits", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 }),
    );
    const onDelete = vi.fn();
    const store = renderWithProject(onDelete);
    const user = await openDeleteDialog();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    const failure = await screen.findByText(/Failed to delete project\./);
    expect(failure.textContent).toContain(PROJECT_NOT_DELETED);
    expect(onDelete).not.toHaveBeenCalled();
    expect(selectProject(store.getState(), "p1")).toBeDefined();
    expect(toastService.success).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("while pending shows a busy confirm and ignores a second confirm; on success removes the project after onDelete, then toasts", async () => {
    let release: (r: Response) => void = () => undefined;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
    );
    let isProjectPresentAtOnDelete: boolean | null = null;
    let storeRef: ReturnType<typeof makeStore> | null = null;
    const onDelete = vi.fn(() => {
      isProjectPresentAtOnDelete =
        storeRef !== null && !!selectProject(storeRef.getState(), "p1");
    });
    storeRef = renderWithProject(onDelete);
    const user = await openDeleteDialog();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    const busy = await screen.findByRole("button", { name: /Deleting/ });
    expect(busy).toBeDisabled();
    await user.click(busy);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
    expect(selectProject(storeRef.getState(), "p1")).toBeDefined();
    expect(toastService.success).not.toHaveBeenCalled();

    release(new Response(null, { status: 200 }));

    await waitFor(() =>
      expect(toastService.success).toHaveBeenCalledWith(
        "Project deleted",
        "Novel",
      ),
    );
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(isProjectPresentAtOnDelete).toBe(true);
    expect(selectProject(storeRef.getState(), "p1")).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Delete project" }),
    ).not.toBeInTheDocument();
  });
});
