/**
 * Feature 77 Task 18 (FR-24): the project Delete menu item is disabled with a
 * visible, described reason only when the paired caller's `projectDeletion`
 * limit is on.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import ManageProjectMenu from "../../components/Start/ManageProjectMenu";
import { makeStore } from "../../src/store/store";
import { PROJECT_DELETION_LIMITED_REASON } from "../../components/Sharing/sharing-copy";
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
