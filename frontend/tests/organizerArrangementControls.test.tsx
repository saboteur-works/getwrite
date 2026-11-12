/** @vitest-environment jsdom */
/**
 * Feature 109, Task 31 (FR-14, FR-15, FR-19): the presentational arrangement
 * controls. Every callback is a spy; the component holds no list state.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrganizerArrangementControls, {
  type OrganizerArrangementControlsProps,
} from "../components/WorkArea/Views/OrganizerView/OrganizerArrangementControls";
import type {
  OrganizerArrangement,
  OrganizerArrangementAvailability,
} from "../src/lib/models/organizer-grid-types";

afterEach(cleanup);

const A: OrganizerArrangement = {
  id: "a-1",
  name: "By status",
  source: { kind: "folder", folderId: "f1", scope: "children" },
  rows: { kind: "status" },
  columns: "none",
};
const B: OrganizerArrangement = {
  id: "b-2",
  name: "Old query",
  source: { kind: "smart-folder", queryId: "q9" },
  rows: "none",
  columns: "order",
};

type User = ReturnType<typeof userEvent.setup>;

function setup(props: Partial<OrganizerArrangementControlsProps> = {}) {
  const callbacks = {
    onSelect: vi.fn(),
    onAdd: vi.fn().mockResolvedValue({ ok: true, id: "n" }),
    onRename: vi.fn().mockResolvedValue({ ok: true, id: "a-1" }),
    onDelete: vi.fn().mockResolvedValue({ ok: true, id: "a-1" }),
  };
  const availability: Record<string, OrganizerArrangementAvailability> = {
    "a-1": { status: "available" },
    "b-2": {
      status: "unavailable",
      reason: "query-missing",
      message: "The smart folder no longer exists.",
    },
  };
  const merged: OrganizerArrangementControlsProps = {
    arrangements: [A, B],
    selectedId: null,
    availability,
    isChangedSinceApplied: false,
    ...callbacks,
    ...props,
  };
  const user = userEvent.setup();
  const utils = render(<OrganizerArrangementControls {...merged} />);
  return { user, callbacks, merged, ...utils };
}

async function openList(user: User) {
  await user.click(screen.getByRole("button", { name: /^arrangements/i }));
}

async function openAddForm(user: User) {
  await openList(user);
  await user.click(
    screen.getByRole("button", { name: "Save current arrangement" }),
  );
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

describe("OrganizerArrangementControls", () => {
  it("shows Default when none is applied and the applied name otherwise", () => {
    const { rerender, merged } = setup();
    expect(screen.getByText("Applied: Default")).toBeTruthy();
    rerender(<OrganizerArrangementControls {...merged} selectedId="a-1" />);
    expect(screen.getByText("Applied: By status")).toBeTruthy();
  });

  it("shows whether the grid has changed since", () => {
    const { rerender, merged } = setup();
    expect(screen.getByText("As applied")).toBeTruthy();
    rerender(
      <OrganizerArrangementControls {...merged} isChangedSinceApplied />,
    );
    expect(screen.getByText("Changed since applied")).toBeTruthy();
  });

  it("applies an arrangement in one click", async () => {
    const { user, callbacks } = setup();
    await openList(user);
    await user.click(button("Apply By status"));
    expect(callbacks.onSelect).toHaveBeenCalledTimes(1);
    expect(callbacks.onSelect).toHaveBeenCalledWith("a-1");
  });

  it("applies Default with null", async () => {
    const { user, callbacks } = setup({ selectedId: "a-1" });
    await openList(user);
    await user.click(button("Apply Default"));
    expect(callbacks.onSelect).toHaveBeenCalledWith(null);
  });

  it("shows the reason of an unavailable one, cannot apply it, can rename and delete it", async () => {
    const { user, callbacks } = setup();
    await openList(user);
    expect(
      screen.getByText(/The smart folder no longer exists\./),
    ).toBeTruthy();
    const apply = button("Apply Old query");
    expect(apply.disabled).toBe(true);
    await user.click(apply);
    expect(callbacks.onSelect).not.toHaveBeenCalled();
    expect(button("Rename Old query").disabled).toBe(false);
    expect(button("Delete Old query").disabled).toBe(false);
  });

  it("does not call a pending arrangement unavailable", async () => {
    const { user } = setup({ availability: { "a-1": { status: "pending" } } });
    await openList(user);
    expect(screen.queryByText(/no longer exists/)).toBeNull();
  });

  it("saves a trimmed name through onAdd and closes the form", async () => {
    const { user, callbacks } = setup();
    await openAddForm(user);
    await user.type(screen.getByLabelText("Arrangement name"), "  Plot  ");
    await user.click(button("Save"));
    expect(callbacks.onAdd).toHaveBeenCalledWith("Plot");
    expect(screen.queryByLabelText("Arrangement name")).toBeNull();
  });

  it.each([
    ["   ", /name is required/i],
    ["x".repeat(101), /100 characters or fewer/i],
    ["  BY STATUS ", /already uses that name/i],
  ])("refuses name %j with a message and calls nothing", async (name, msg) => {
    const { user, callbacks } = setup();
    await openAddForm(user);
    await user.type(screen.getByLabelText("Arrangement name"), name);
    await user.click(button("Save"));
    expect(screen.getByRole("alert").textContent).toMatch(msg);
    expect(callbacks.onAdd).not.toHaveBeenCalled();
  });

  it("allows renaming to a different case of its own name", async () => {
    const { user, callbacks } = setup();
    await openList(user);
    await user.click(button("Rename By status"));
    const input = screen.getByLabelText("Arrangement name") as HTMLInputElement;
    expect(input.value).toBe("By status");
    await user.clear(input);
    await user.type(input, "BY STATUS");
    await user.click(button("Save"));
    expect(callbacks.onRename).toHaveBeenCalledWith("a-1", "BY STATUS");
  });

  it("shows a failed save message, keeps the form and the list", async () => {
    const { user } = setup({
      onAdd: vi
        .fn()
        .mockResolvedValue({
          ok: false,
          reason: "limit-reached",
          message: "A project can hold at most 50 arrangements.",
        }),
    });
    await openAddForm(user);
    await user.type(screen.getByLabelText("Arrangement name"), "Plot");
    await user.click(button("Save"));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "at most 50",
    );
    expect(
      (screen.getByLabelText("Arrangement name") as HTMLInputElement).value,
    ).toBe("Plot");
    expect(button("Apply By status")).toBeTruthy();
    expect(button("Apply Old query")).toBeTruthy();
  });

  it("shows a failed rename message and a thrown transport error", async () => {
    const onRename = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        reason: "not-found",
        message: "That arrangement was not found.",
      })
      .mockRejectedValueOnce(new Error("network"));
    const { user } = setup({ onRename });
    await openList(user);
    await user.click(button("Rename By status"));
    await user.type(screen.getByLabelText("Arrangement name"), "2");
    await user.click(button("Save"));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "was not found",
    );
    await user.click(button("Save"));
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /could not be saved/i,
    );
  });

  it("confirms a delete, then calls onDelete; cancel calls nothing", async () => {
    const { user, callbacks } = setup();
    await openList(user);
    await user.click(button("Delete By status"));
    await user.click(button("Cancel"));
    expect(callbacks.onDelete).not.toHaveBeenCalled();
    await user.click(button("Delete By status"));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(callbacks.onDelete).toHaveBeenCalledWith("a-1");
  });

  it("shows a failed delete message and leaves the list", async () => {
    const { user } = setup({
      onDelete: vi
        .fn()
        .mockResolvedValue({
          ok: false,
          reason: "not-found",
          message: "That arrangement was not found.",
        }),
    });
    await openList(user);
    await user.click(button("Delete By status"));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete",
      }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "was not found",
    );
    expect(button("Apply By status")).toBeTruthy();
  });

  it("is operable by keyboard and wraps for narrow widths", async () => {
    const { user, callbacks, container } = setup();
    await user.tab();
    await user.keyboard("{Enter}");
    button("Apply By status").focus();
    await user.keyboard("{Enter}");
    expect(callbacks.onSelect).toHaveBeenCalledWith("a-1");
    expect(container.querySelector(".flex-wrap")).toBeTruthy();
  });
});
