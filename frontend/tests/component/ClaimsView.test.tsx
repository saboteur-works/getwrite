/**
 * Component tests for `ClaimsView` (Feature 108, Task 22, FR-16, FR-17). The
 * view is presentational: state comes in as a prop; open goes out as a
 * callback. It lists, filters and opens; it has no write control.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ClaimsView, {
  type ClaimViewItem,
  type ClaimsViewState,
} from "../../components/Claims/ClaimsView";
import type { ClaimDisplayModel } from "../../src/lib/claim-display";
import { runAxe } from "../a11y/helpers/axe";

function display(over: Partial<ClaimDisplayModel> = {}): ClaimDisplayModel {
  return {
    kind: "claim",
    statement: "The harbour closed in 1921.",
    quote: "harbour lights",
    statusId: "unverified",
    statusLabel: "Unverified",
    isStatusOffList: false,
    statusDate: "2026-11-10",
    isUnsourced: true,
    isSourced: false,
    sourceState: "none",
    sourceName: undefined,
    sourcePartRemoved: false,
    ...over,
  };
}

function item(
  id: string,
  over: Partial<ClaimDisplayModel> = {},
  extra: Partial<ClaimViewItem> = {},
): ClaimViewItem {
  return {
    resourceId: "r1",
    resourceName: "Chapter One",
    annotationId: id,
    display: display({ statement: `Statement ${id}`, ...over }),
    isDetached: false,
    ...extra,
  };
}

const sourced = {
  isUnsourced: false,
  isSourced: true,
  sourceState: "present" as const,
  sourceName: "Port ledger",
};

function ready(
  items: ClaimViewItem[],
  failures: { resourceId: string; resourceName: string }[] = [],
): ClaimsViewState {
  return {
    status: "ready",
    items,
    failures: failures.map((f) => ({ ...f, message: "unreadable" })),
  };
}

function setup(state: ClaimsViewState) {
  const onRetry = vi.fn();
  const onOpenClaim = vi.fn();
  const utils = render(
    <ClaimsView state={state} onRetry={onRetry} onOpenClaim={onOpenClaim} />,
  );
  return { onRetry, onOpenClaim, ...utils };
}

const LIST_NAME = "Claims in this project";

describe("ClaimsView states", () => {
  it("shows loading as status text", () => {
    setup({ status: "loading" });
    expect(screen.getByRole("status")).toHaveTextContent("Loading claims");
    expect(screen.getByRole("heading", { name: "Claims" })).toBeVisible();
  });

  it("shows a failed read with a retry, never as no claims", async () => {
    const { onRetry } = setup({
      status: "failed",
      isLocked: false,
      message: "Boom.",
    });
    expect(screen.getByRole("alert")).toHaveTextContent("could not be listed");
    expect(screen.queryByText(/There are no claims/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("says a locked project cannot be listed", () => {
    setup({ status: "failed", isLocked: true, message: "" });
    expect(screen.getByRole("alert")).toHaveTextContent("locked");
  });

  it("says there are no claims when the list is empty", () => {
    setup(ready([]));
    expect(screen.getByText("There are no claims.")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("names unread resources above the claims, with a retry", async () => {
    const { onRetry } = setup(
      ready([item("a")], [{ resourceId: "r9", resourceName: "Chapter Nine" }]),
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Chapter Nine");
    expect(alert).toHaveTextContent("not read");
    expect(screen.getByText("Statement a")).toBeVisible();
    expect(
      alert.compareDocumentPosition(screen.getByText("Statement a")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await userEvent.click(
      within(alert).getByRole("button", { name: "Try again" }),
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not say there are no claims when only failures exist", () => {
    setup(ready([], [{ resourceId: "r9", resourceName: "Chapter Nine" }]));
    expect(screen.queryByText("There are no claims.")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("Chapter Nine");
  });
});

describe("ClaimsView list", () => {
  it("shows statement, quote, resource, status with date and unsourced", () => {
    setup(ready([item("a")]));
    expect(screen.getByText("Statement a")).toBeVisible();
    expect(screen.getByText(/harbour lights/)).toBeVisible();
    expect(screen.getByText("Chapter One")).toBeVisible();
    const list = within(screen.getByRole("list", { name: LIST_NAME }));
    expect(list.getByText(/Status: Unverified, 2026-11-10/)).toBeVisible();
    expect(list.getByText("Unsourced")).toBeVisible();
  });

  it("shows the Source name for a sourced claim", () => {
    setup(ready([item("a", sourced)]));
    expect(screen.getByText(/Port ledger/)).toBeVisible();
    const list = within(screen.getByRole("list", { name: LIST_NAME }));
    expect(list.queryByText(/unsourced/i)).toBeNull();
  });

  it("says in text that a passage was not checked when its document could not be read, and does not call it detached", () => {
    setup(ready([item("u", {}, { isPassageUnchecked: true })]));
    expect(
      screen.getByText(
        "The passage could not be checked against the document.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/passage is detached/i)).toBeNull();
  });

  it("shows detached, removed, purged and could-not-be-checked in text", () => {
    setup(
      ready([
        item("d", {}, { isDetached: true }),
        item("r", { ...sourced, sourceState: "removed" }),
        item("p", { ...sourced, sourceState: "permanently-deleted" }),
        item("u", {
          isUnsourced: false,
          isSourced: false,
          sourceState: "unchecked",
          sourceName: "Ledger",
        }),
      ]),
    );
    expect(screen.getByText(/passage is detached/i)).toBeVisible();
    expect(screen.getByText(/in Trash/i)).toBeVisible();
    expect(screen.getByText(/permanently deleted/i)).toBeVisible();
    expect(screen.getByText(/could not be checked/i)).toBeVisible();
  });

  it("marks a stored status that is not on the list", () => {
    setup(
      ready([
        item("o", {
          statusId: "mystery",
          statusLabel: "mystery",
          isStatusOffList: true,
        }),
      ]),
    );
    expect(screen.getByText(/mystery/)).toBeVisible();
    expect(screen.getByText(/not a listed status/i)).toBeVisible();
  });

  it("opens a claim through the callback and has no write control", async () => {
    const { onOpenClaim } = setup(ready([item("a")]));
    await userEvent.click(
      screen.getByRole("button", { name: /Open claim: Statement a/ }),
    );
    expect(onOpenClaim).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: "r1", annotationId: "a" }),
    );
    const names = screen
      .getAllByRole("button")
      .map(
        (b: HTMLElement) => b.getAttribute("aria-label") ?? b.textContent ?? "",
      );
    expect(
      names.some((n: string) => /delete|re-attach|link|edit/i.test(n)),
    ).toBe(false);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("opens a detached claim too", async () => {
    const { onOpenClaim } = setup(ready([item("d", {}, { isDetached: true })]));
    await userEvent.click(screen.getByRole("button", { name: /Open claim/ }));
    expect(onOpenClaim).toHaveBeenCalledTimes(1);
  });
});

describe("ClaimsView filters", () => {
  const items = [
    item("a", { statusId: "verified", statusLabel: "Verified", ...sourced }),
    item("b", { statusId: "verified", statusLabel: "Verified" }),
    item("c", { statusId: "disputed", statusLabel: "Disputed" }),
  ];

  it("states the active filters in text, combined", async () => {
    setup(ready(items));
    expect(screen.getByText("Showing: All claims")).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText("Status"), "verified");
    await userEvent.selectOptions(screen.getByLabelText("Source"), "unsourced");
    expect(
      screen.getByText("Showing: Status: Verified; Unsourced"),
    ).toBeVisible();
    expect(screen.getByText("Statement b")).toBeVisible();
    expect(screen.queryByText("Statement a")).toBeNull();
    expect(screen.queryByText("Statement c")).toBeNull();
  });

  it("says no claim matches, not that there are none", async () => {
    setup(ready(items));
    await userEvent.selectOptions(
      screen.getByLabelText("Status"),
      "needs-review",
    );
    expect(screen.getByText(/No claim matches the filters/)).toBeVisible();
    expect(screen.queryByText("There are no claims.")).toBeNull();
  });

  it("offers all four statuses", () => {
    setup(ready(items));
    const options = within(screen.getByLabelText("Status"))
      .getAllByRole("option")
      .map((o: HTMLElement) => o.textContent);
    expect(options).toEqual([
      "All",
      "Unverified",
      "Verified",
      "Disputed",
      "Needs review",
    ]);
  });
});

describe("ClaimsView accessibility", () => {
  it("passes axe in the list, failure and empty states", async () => {
    const list = setup(
      ready(
        [item("a", sourced), item("d", {}, { isDetached: true })],
        [{ resourceId: "r9", resourceName: "Chapter Nine" }],
      ),
    );
    await runAxe(list.container, ["region"]);
    list.unmount();
    const failed = setup({ status: "failed", isLocked: false, message: "x" });
    await runAxe(failed.container, ["region"]);
    failed.unmount();
    const empty = setup(ready([]));
    await runAxe(empty.container, ["region"]);
  });

  it("is operable by keyboard: filters then open", async () => {
    const { onOpenClaim } = setup(ready([item("a")]));
    await userEvent.tab();
    expect(screen.getByLabelText("Status")).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText("Source")).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: /Open claim/ })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onOpenClaim).toHaveBeenCalledTimes(1);
  });
});
