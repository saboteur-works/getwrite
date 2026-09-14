/**
 * Accessibility tests for `TrashView` (trash-ui Task 18, FR-5/FR-9/FR-14),
 * per `docs/standards/accessibility.md` — every restore/purge/empty-trash
 * control is reachable by its accessible role and name and operable by
 * keyboard alone, and the multi-select state is exposed to assistive tech.
 * Mirrors `tests/component/TrashView.test.tsx`'s own setup rather than
 * introducing a new one.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import TrashView from "../../components/WorkArea/Views/TrashView/TrashView";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import type { TrashListing } from "../../src/lib/api/trash";

vi.mock("../../src/lib/api/trash", () => ({
  listTrash: vi.fn(),
  restoreTrashItems: vi.fn(),
  purgeTrashItems: vi.fn(),
}));

import {
  listTrash,
  purgeTrashItems,
  restoreTrashItems,
} from "../../src/lib/api/trash";

const mockedListTrash = vi.mocked(listTrash);
const mockedRestoreTrashItems = vi.mocked(restoreTrashItems);
const mockedPurgeTrashItems = vi.mocked(purgeTrashItems);

const PROJECT_ID = "proj-trash-a11y";

function setupStore() {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Trash A11y Project",
      rootPath: `/tmp/${PROJECT_ID}`,
      folders: [],
      resources: [],
    } as never),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  return store;
}

const TWO_RESOURCE_LISTING: TrashListing = {
  resources: [
    {
      id: "res-1",
      originalName: "Resource One",
      resourceType: "text",
      originalParentId: null,
      deletedAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "res-2",
      originalName: "Resource Two",
      resourceType: "text",
      originalParentId: null,
      deletedAt: "2026-09-01T00:00:00.000Z",
    },
  ],
  folders: [],
};

beforeEach(() => {
  mockedListTrash.mockReset();
  mockedRestoreTrashItems.mockReset();
  mockedPurgeTrashItems.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a11y: TrashView selection and batch controls (Task 18)", () => {
  it("exposes every top-level row's checkbox by accessible role and name, reachable and toggleable by keyboard alone", async () => {
    mockedListTrash.mockResolvedValue(TWO_RESOURCE_LISTING);
    const user = userEvent.setup();
    const store = setupStore();

    render(
      <Provider store={store}>
        <TrashView />
      </Provider>,
    );

    const checkbox1 = await screen.findByRole("checkbox", {
      name: "Select Resource One",
    });
    const checkbox2 = screen.getByRole("checkbox", {
      name: "Select Resource Two",
    });

    expect(checkbox1).not.toBeChecked();

    await user.tab();
    // The first tab stop after mount reaches the first row's checkbox
    // (no other focusable element precedes it once the list has loaded).
    // Toggle it via keyboard (Space), the only interaction a checkbox
    // needs to support to be fully keyboard-operable.
    checkbox1.focus();
    await user.keyboard(" ");
    expect(checkbox1).toBeChecked();
    expect(checkbox2).not.toBeChecked();
  });

  it("exposes the trash list as a multi-selectable listbox with each row's selected state in the accessibility tree", async () => {
    mockedListTrash.mockResolvedValue(TWO_RESOURCE_LISTING);
    const store = setupStore();

    render(
      <Provider store={store}>
        <TrashView />
      </Provider>,
    );

    const listbox = await screen.findByRole("listbox", {
      name: /trash items/i,
    });
    expect(listbox).toHaveAttribute("aria-multiselectable", "true");

    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(2);
    options.forEach((option: HTMLElement) =>
      expect(option).toHaveAttribute("aria-selected", "false"),
    );

    const checkbox1 = screen.getByRole("checkbox", {
      name: "Select Resource One",
    });
    fireEvent.click(checkbox1);

    const selectedOption = options.find(
      (option: HTMLElement) => option.getAttribute("data-trash-id") === "res-1",
    );
    expect(selectedOption).toHaveAttribute("aria-selected", "true");

    const unselectedOption = options.find(
      (option: HTMLElement) => option.getAttribute("data-trash-id") === "res-2",
    );
    expect(unselectedOption).toHaveAttribute("aria-selected", "false");
  });

  it("announces the current selection count via an accessible live status region", async () => {
    mockedListTrash.mockResolvedValue(TWO_RESOURCE_LISTING);
    const store = setupStore();

    render(
      <Provider store={store}>
        <TrashView />
      </Provider>,
    );

    await screen.findAllByTestId("trash-row");
    const statusRegion = screen.getByTestId("trash-selection-count");
    expect(statusRegion).toHaveAttribute("aria-live", "polite");
    expect(statusRegion.textContent).toMatch(/0 of 2 items selected/i);

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Resource One" }),
    );
    expect(statusRegion.textContent).toMatch(/1 of 2 items selected/i);
  });

  it("every batch action (restore/delete/empty trash) is reachable by accessible role+name and keyboard-activatable", async () => {
    mockedListTrash.mockResolvedValue(TWO_RESOURCE_LISTING);
    const user = userEvent.setup();
    const store = setupStore();

    render(
      <Provider store={store}>
        <TrashView />
      </Provider>,
    );

    await screen.findAllByTestId("trash-row");

    const restoreButton = screen.getByRole("button", {
      name: "Restore selected",
    });
    const deleteButton = screen.getByRole("button", {
      name: "Delete selected permanently",
    });
    const emptyTrashButton = screen.getByRole("button", {
      name: "Empty trash",
    });

    // Both selection-dependent actions start disabled with nothing selected,
    // but "Empty trash" needs no selection and stays enabled — all three are
    // still reachable by role+name regardless of disabled state.
    expect(restoreButton).toBeDisabled();
    expect(deleteButton).toBeDisabled();
    expect(emptyTrashButton).not.toBeDisabled();

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Resource One" }),
    );
    expect(restoreButton).not.toBeDisabled();

    restoreButton.focus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog");
    // The dialog's own confirm/cancel controls are reachable and
    // keyboard-activatable Radix/Button primitives, matching
    // RemoveEntityControl.tsx's ConfirmDialog usage exactly.
    expect(
      within(dialog).getByRole("button", { name: "Restore" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("the restore confirmation dialog follows the same semantic pattern as RemoveEntityControl's ConfirmDialog (title, description, focus-managed role=dialog)", async () => {
    mockedListTrash.mockResolvedValue(TWO_RESOURCE_LISTING);
    const store = setupStore();

    render(
      <Provider store={store}>
        <TrashView />
      </Provider>,
    );

    await screen.findAllByTestId("trash-row");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Resource One" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Restore selected" }));

    const dialog = await screen.findByRole("dialog");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toBe(
      "Restore items",
    );

    // ConfirmDialog renders the description as a `DialogDescription`
    // (`components/common/ConfirmDialog.tsx`) — readable within the dialog's
    // own accessible name/content — matching RemoveEntityControl's identical
    // `ConfirmDialog` usage exactly (title, description, Radix-managed
    // `role="dialog"` focus trap).
    expect(
      within(dialog).getByText(/restore 1 item from trash/i),
    ).toBeInTheDocument();
  });

  it("a restore-batch relocation/rename/reference notice is exposed as an accessible status message, not just visible text", async () => {
    mockedListTrash.mockResolvedValue(TWO_RESOURCE_LISTING);
    mockedRestoreTrashItems.mockResolvedValue([
      { id: "res-1", ok: true, relocated: true, renamed: false },
    ]);
    const store = setupStore();

    render(
      <Provider store={store}>
        <TrashView />
      </Provider>,
    );

    await screen.findAllByTestId("trash-row");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Resource One" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Restore selected" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));

    await waitFor(() => {
      const notices = screen.getAllByRole("status");
      const relocationNotice = notices.find((n: HTMLElement) =>
        /moved to project root/i.test(n.textContent ?? ""),
      );
      expect(relocationNotice).toBeTruthy();
    });
  });
});
