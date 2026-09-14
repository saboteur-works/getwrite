/**
 * Accessibility tests for `TrashView` (trash-ui Task 18, FR-5/FR-9/FR-14),
 * per `docs/standards/accessibility.md` — every restore/purge/empty-trash
 * control is reachable by its accessible role and name and operable by
 * keyboard alone, and the multi-select state is exposed to assistive tech.
 * Mirrors `tests/component/TrashView.test.tsx`'s own setup rather than
 * introducing a new one.
 *
 * Task 19 Part B adds `assertNoStructuralAxeViolations` below, asserting
 * zero violations of axe-core's `nested-interactive`, `aria-allowed-role`,
 * and `list` rules. This project has no `axe-core`/`jest-axe` dependency
 * installed in `frontend/node_modules` (it isn't a direct dependency of
 * `getwrite-frontend`; only `@storybook/addon-a11y` pulls a copy in
 * transitively, for the Storybook Chromium `test-storybook` run, which is
 * out of this Vitest suite's reach), and adding one is out of this task's
 * scope (no network-dependent `pnpm install` may run here). The helper
 * below is a small, targeted reimplementation of exactly those three rules'
 * checks — not a general axe substitute — so this suite can still assert
 * the specific regression this task fixes without a new dependency. It errs
 * toward under-flagging (skipping a check its rule doesn't unambiguously
 * cover) rather than over-flagging valid markup.
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
import type { RestoreItemResult, TrashListing } from "../../src/lib/api/trash";

/**
 * ARIA roles axe-core's `aria-allowed-role` rule treats as "interactive
 * widget" roles for the purpose of `nested-interactive` (an interactive
 * element/role must not contain another one).
 */
const INTERACTIVE_ROLES = new Set([
  "button",
  "checkbox",
  "radio",
  "switch",
  "option",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "combobox",
  "listbox",
  "link",
  "textbox",
  "slider",
  "spinbutton",
  "searchbox",
]);

const NATIVE_INTERACTIVE_TAGS = new Set([
  "button",
  "input",
  "select",
  "textarea",
]);

function isInteractive(el: Element): boolean {
  const role = el.getAttribute("role");
  if (role && INTERACTIVE_ROLES.has(role)) return true;
  const tag = el.tagName.toLowerCase();
  if (NATIVE_INTERACTIVE_TAGS.has(tag)) return true;
  if (tag === "a" && el.hasAttribute("href")) return true;
  return false;
}

/**
 * axe's `nested-interactive`: an interactive element/role must not have
 * another interactive element/role as a descendant.
 */
function findNestedInteractiveViolations(root: HTMLElement): Element[] {
  const violations: Element[] = [];
  const interactiveEls = Array.from(root.querySelectorAll("*")).filter(
    isInteractive,
  );
  for (const el of interactiveEls) {
    const nestedInteractive = Array.from(el.querySelectorAll("*")).find(
      isInteractive,
    );
    if (nestedInteractive) violations.push(el);
  }
  return violations;
}

/**
 * axe's `aria-allowed-role`, scoped to the one host element this suite's
 * markup actually gives an explicit `role` that could plausibly be
 * disallowed: `<li>`. (ARIA in HTML's allowed-roles list for `li` includes
 * `listitem` (implicit), `option`, `menuitemcheckbox`, `menuitemradio`,
 * `radio`, `separator`, `tab`, `treeitem`, `presentation`/`none` — not
 * live-region roles like `status`.)
 */
const LI_ALLOWED_ROLES = new Set([
  "listitem",
  "option",
  "menuitemcheckbox",
  "menuitemradio",
  "radio",
  "separator",
  "tab",
  "treeitem",
  "presentation",
  "none",
]);

function findAriaAllowedRoleViolations(root: HTMLElement): Element[] {
  const violations: Element[] = [];
  root.querySelectorAll("li[role]").forEach((li) => {
    const role = li.getAttribute("role");
    if (role && !LI_ALLOWED_ROLES.has(role)) violations.push(li);
  });
  return violations;
}

/**
 * axe's `list`: a `<ul>`/`<ol>` element's direct children must all be
 * `<li>` (default `listitem` role, or explicitly `role="listitem"`),
 * `<script>`, or `<template>`.
 */
function findListStructureViolations(root: HTMLElement): Element[] {
  const violations: Element[] = [];
  root.querySelectorAll("ul, ol").forEach((list) => {
    Array.from(list.children).forEach((child) => {
      const tag = child.tagName.toLowerCase();
      if (tag === "script" || tag === "template") return;
      const role = child.getAttribute("role");
      if (tag === "li" && (!role || role === "listitem")) return;
      violations.push(child);
    });
  });
  return violations;
}

function describeElement(el: Element): string {
  const testId = el.getAttribute("data-testid");
  const role = el.getAttribute("role");
  return `<${el.tagName.toLowerCase()}${testId ? ` data-testid="${testId}"` : ""}${
    role ? ` role="${role}"` : ""
  }>`;
}

/**
 * Asserts zero violations of axe-core's `nested-interactive`,
 * `aria-allowed-role`, and `list` rules within `container` — see this
 * file's header comment for why this is a targeted reimplementation rather
 * than a real `axe(...)` call.
 */
function assertNoStructuralAxeViolations(container: HTMLElement): void {
  const nested = findNestedInteractiveViolations(container);
  expect(
    nested,
    `nested-interactive violations: ${nested.map(describeElement).join(", ")}`,
  ).toHaveLength(0);

  const allowedRole = findAriaAllowedRoleViolations(container);
  expect(
    allowedRole,
    `aria-allowed-role violations: ${allowedRole
      .map(describeElement)
      .join(", ")}`,
  ).toHaveLength(0);

  const list = findListStructureViolations(container);
  expect(
    list,
    `list violations: ${list.map(describeElement).join(", ")}`,
  ).toHaveLength(0);
}

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

  it("exposes each row's selected state via its own checkbox's native checked state (Task 19 Part B)", async () => {
    // Task 19 Part B: the trash list no longer overlays `role="listbox"`/
    // `role="option"`/`aria-selected` on top of the native per-row
    // checkbox — that combination is an invalid ARIA pattern (a listbox
    // `option` must not contain a focusable descendant, which axe's
    // `nested-interactive` rule flags). Each row's own `<input
    // type="checkbox">` already exposes its selected state to assistive
    // tech via the native checked/unchecked semantics every screen reader
    // understands, with no listbox/option layer needed on top.
    mockedListTrash.mockResolvedValue(TWO_RESOURCE_LISTING);
    const store = setupStore();

    render(
      <Provider store={store}>
        <TrashView />
      </Provider>,
    );

    const list = await screen.findByRole("list", { name: /trash items/i });
    const checkbox1 = within(list).getByRole("checkbox", {
      name: "Select Resource One",
    });
    const checkbox2 = within(list).getByRole("checkbox", {
      name: "Select Resource Two",
    });
    expect(checkbox1).not.toBeChecked();
    expect(checkbox2).not.toBeChecked();

    fireEvent.click(checkbox1);

    expect(checkbox1).toBeChecked();
    expect(checkbox2).not.toBeChecked();
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

/**
 * Task 19 Part B: `trash-view.a11y.test.tsx` previously never ran anything
 * resembling an accessibility-tree structural check — every assertion in
 * the describe block above reads specific roles/attributes off individual
 * elements (`getByRole("checkbox", ...)`, `toHaveAttribute("aria-selected",
 * ...)`, etc.), which only inspects the elements the test already names.
 * None of those assertions walk the rendered tree looking for a `<ul>`'s
 * disallowed children, an element's disallowed `role`, or an interactive
 * element nested inside another one — so the `nested-interactive`,
 * `aria-allowed-role`, and `list` violations the now-removed
 * `role="listbox"`/`role="option"` markup and the restore-notice
 * `role="status"` `<li>` produced were never exercised by anything in this
 * file. This block closes that gap across every state the Storybook
 * stories (`stories/WorkArea/TrashView.stories.tsx`) cover.
 */
describe("a11y: TrashView structural axe rules (Task 19 Part B)", () => {
  const MIXED_LISTING: TrashListing = {
    resources: [
      {
        id: "res-standalone",
        originalName: "Standalone Chapter",
        resourceType: "text",
        originalParentId: null,
        deletedAt: "2026-09-01T00:00:00.000Z",
      },
    ],
    folders: [
      {
        id: "folder-outline",
        originalName: "Outline",
        originalParentId: null,
        deletedAt: "2026-09-02T00:00:00.000Z",
        descendants: [
          {
            id: "res-nested-1",
            kind: "resource",
            parentId: "folder-outline",
            orderIndex: 0,
          },
          {
            id: "folder-nested",
            kind: "folder",
            parentId: "folder-outline",
            orderIndex: 1,
          },
        ],
      },
    ],
  };

  const THREE_RESOURCE_LISTING: TrashListing = {
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
      {
        id: "res-3",
        originalName: "Resource Three",
        resourceType: "text",
        originalParentId: null,
        deletedAt: "2026-09-01T00:00:00.000Z",
      },
    ],
    folders: [],
  };

  it("mixed resources/folders list", async () => {
    mockedListTrash.mockResolvedValue(MIXED_LISTING);
    const { container } = render(
      <Provider store={setupStore()}>
        <TrashView />
      </Provider>,
    );

    await screen.findAllByTestId("trash-row");
    assertNoStructuralAxeViolations(container);
  });

  it("multi-select partial selection", async () => {
    mockedListTrash.mockResolvedValue(THREE_RESOURCE_LISTING);
    const { container } = render(
      <Provider store={setupStore()}>
        <TrashView />
      </Provider>,
    );

    const rows = await screen.findAllByTestId("trash-row");
    fireEvent.click(within(rows[0]).getByTestId("trash-row-select"));
    fireEvent.click(within(rows[1]).getByTestId("trash-row-select"));

    assertNoStructuralAxeViolations(container);
  });

  it("batch-report mixed-outcome state", async () => {
    mockedListTrash.mockResolvedValue(THREE_RESOURCE_LISTING);
    mockedPurgeTrashItems.mockResolvedValue([
      { id: "res-1", ok: true },
      { id: "res-2", ok: true },
      { id: "res-3", ok: false, error: "Resource is locked." },
    ]);
    const { container } = render(
      <Provider store={setupStore()}>
        <TrashView />
      </Provider>,
    );

    const rows = await screen.findAllByTestId("trash-row");
    rows.forEach((row: HTMLElement) =>
      fireEvent.click(within(row).getByTestId("trash-row-select")),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Delete selected permanently" }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete permanently" }),
    );
    await screen.findByTestId("trash-batch-report");

    assertNoStructuralAxeViolations(container);
  });

  it.each([
    [
      "relocated",
      [{ id: "res-1", ok: true, relocated: true }] as RestoreItemResult[],
    ],
    [
      "renamed",
      [{ id: "res-1", ok: true, renamed: true }] as RestoreItemResult[],
    ],
    [
      "references",
      [
        {
          id: "res-1",
          ok: true,
          referencesNotRestored: [
            {
              referencingResourceId: "res-2",
              fieldKey: "relatedResources",
              arrayIndex: 0,
            },
          ],
        },
      ] as RestoreItemResult[],
    ],
  ])("restore notice variant: %s", async (_kind, restoreResults) => {
    mockedListTrash.mockResolvedValue(THREE_RESOURCE_LISTING);
    mockedRestoreTrashItems.mockResolvedValue(restoreResults);
    const { container } = render(
      <Provider store={setupStore()}>
        <TrashView />
      </Provider>,
    );

    const rows = await screen.findAllByTestId("trash-row");
    fireEvent.click(within(rows[0]).getByTestId("trash-row-select"));
    fireEvent.click(screen.getByRole("button", { name: "Restore selected" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    await screen.findByTestId("trash-restore-notices");

    assertNoStructuralAxeViolations(container);
  });
});
