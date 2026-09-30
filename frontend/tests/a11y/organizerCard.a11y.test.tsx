import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrganizerCard from "../../components/WorkArea/Views/OrganizerView/OrganizerCard";
import { createTextResource } from "../../src/lib/models/resource";
import { runAxe } from "./helpers/axe";

/**
 * Accessibility pass on the clickable title button OrganizerCard gained
 * alongside its per-type icon (Feature 65,
 * `specs/features/organizer-card-icons-and-open.md`, FR-5). Covers: a real
 * axe-core check against both `showBody` render states, that the title is a
 * native `<button>` (not a non-native `role="button"` widget), keyboard
 * operability via Enter, and that the button's accessible name is the
 * resource's title.
 */

describe("a11y: OrganizerCard clickable title", () => {
  it("showBody=true, onSelect + onOpen set: zero axe violations", async () => {
    const res = createTextResource({ name: "Test Resource" });
    const { container } = render(
      <OrganizerCard
        resource={res}
        showBody={true}
        body="Placeholder content"
        onSelect={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    await runAxe(container);
  });

  it("showBody=false, onSelect + onOpen set: zero axe violations", async () => {
    const res = createTextResource({ name: "Test Resource" });
    const { container } = render(
      <OrganizerCard
        resource={res}
        showBody={false}
        onSelect={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    await runAxe(container);
  });

  it('the title element is a real, natively-keyboard-operable <button> (no role="button" widget)', () => {
    const res = createTextResource({ name: "Test Resource" });
    const { container } = render(
      <OrganizerCard resource={res} showBody={true} onSelect={vi.fn()} />,
    );

    const titleButton = screen.getByRole("button", { name: "Test Resource" });
    expect(titleButton.tagName).toBe("BUTTON");

    // No non-native widget (e.g. a div/span with role="button") was
    // introduced for the title.
    expect(container.querySelectorAll('[role="button"]').length).toBe(0);
  });

  it("the title button has an accessible name equal to the resource's title", () => {
    const res = createTextResource({ name: "Test Resource" });
    render(<OrganizerCard resource={res} showBody={true} onSelect={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Test Resource" }),
    ).toBeInTheDocument();
  });

  it("the title button is keyboard-operable: focus + Enter invokes onSelect", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const res = createTextResource({ name: "Test Resource" });
    render(
      <OrganizerCard resource={res} showBody={true} onSelect={onSelect} />,
    );

    const titleButton = screen.getByRole("button", { name: "Test Resource" });
    titleButton.focus();
    expect(titleButton).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

/**
 * Accessibility pass on the grip-icon drag handle and the keyboard reorder
 * path (Task 7, `specs/features/organizer-card-drag-reorder.md`, FR-2/FR-8).
 * Covers: zero axe-core violations in both the enabled and `isDragDisabled`
 * states, native keyboard operability of the handle (tab order, attribute/
 * listener wiring), the absence of any bespoke focus-style CSS beyond the
 * app's existing global `:focus-visible` mechanism (mirroring the title
 * button precedent above), and a handle-level check that the props a real
 * `@dnd-kit/sortable` `useSortable()` would supply are genuinely spread onto
 * the focused DOM element. The actual drag move + FR-8 announcement text are
 * covered end-to-end at the `OrganizerView` level by Task 5's test in
 * `frontend/tests/organizerView.test.tsx` (its `vi.mock("@dnd-kit/core", ...)`
 * wrapper invokes `onDragEnd`/`announcements.onDragEnd` directly with
 * synthetic events) — this file's job is specifically the `OrganizerCard`
 * handle's own focus/keyboard-operability surface, not a re-implementation
 * of that DnD-context test.
 */
describe("a11y: OrganizerCard drag handle", () => {
  it("enabled drag handle: zero axe violations", async () => {
    const res = createTextResource({ name: "Test Resource" });
    const { container } = render(
      <OrganizerCard
        resource={res}
        showBody={true}
        onSelect={vi.fn()}
        dragHandleRef={vi.fn()}
        dragHandleAttributes={{ "aria-roledescription": "sortable" }}
        dragHandleListeners={{ onPointerDown: vi.fn() }}
      />,
    );
    await runAxe(container);
  });

  it("isDragDisabled drag handle: zero axe violations", async () => {
    const res = createTextResource({ name: "Test Resource" });
    const { container } = render(
      <OrganizerCard
        resource={res}
        showBody={true}
        onSelect={vi.fn()}
        dragHandleRef={vi.fn()}
        dragHandleAttributes={{ "aria-roledescription": "sortable" }}
        dragHandleListeners={{ onPointerDown: vi.fn() }}
        isDragDisabled={true}
        dragDisabledReason="Reordering is unavailable while sorted by a smart folder."
      />,
    );
    await runAxe(container);
  });

  it("the enabled drag handle is a native, keyboard-focusable <button> carrying the supplied dragHandleAttributes/dragHandleListeners", () => {
    const onPointerDown = vi.fn();
    const res = createTextResource({ name: "Test Resource" });
    render(
      <OrganizerCard
        resource={res}
        showBody={true}
        onSelect={vi.fn()}
        dragHandleAttributes={{ "aria-roledescription": "sortable" }}
        dragHandleListeners={{ onPointerDown }}
      />,
    );

    const handle = screen.getByRole("button", { name: "Drag to reorder" });
    expect(handle.tagName).toBe("BUTTON");
    expect(handle).toHaveAttribute("tabindex", "0");

    // The supplied dragHandleAttributes were actually spread onto the DOM
    // node, not merely accepted as a prop.
    expect(handle).toHaveAttribute("aria-roledescription", "sortable");

    // The supplied dragHandleListeners were actually wired up: a real
    // @dnd-kit/sortable useSortable() would attach pointer-down here to
    // begin a drag/keyboard-reorder interaction.
    handle.dispatchEvent(
      new window.PointerEvent("pointerdown", { bubbles: true }),
    );
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });

  it("a Tab from the start of the card reaches the drag handle before the title button", async () => {
    const user = userEvent.setup();
    const res = createTextResource({ name: "Test Resource" });
    render(
      <OrganizerCard
        resource={res}
        showBody={true}
        onSelect={vi.fn()}
        dragHandleAttributes={{ "aria-roledescription": "sortable" }}
        dragHandleListeners={{ onPointerDown: vi.fn() }}
      />,
    );

    await user.tab();
    expect(
      screen.getByRole("button", { name: "Drag to reorder" }),
    ).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Test Resource" })).toHaveFocus();
  });

  it("isDragDisabled: the handle drops out of tab order and does not receive dragHandleAttributes/dragHandleListeners", () => {
    const onPointerDown = vi.fn();
    const res = createTextResource({ name: "Test Resource" });
    render(
      <OrganizerCard
        resource={res}
        showBody={true}
        onSelect={vi.fn()}
        dragHandleAttributes={{ "aria-roledescription": "sortable" }}
        dragHandleListeners={{ onPointerDown }}
        isDragDisabled={true}
        dragDisabledReason="Reordering is unavailable while sorted by a smart folder."
      />,
    );

    const handle = screen.getByRole("button", { name: "Drag to reorder" });
    expect(handle).toHaveAttribute("tabindex", "-1");
    expect(handle).toHaveAttribute("aria-disabled", "true");
    expect(handle).not.toHaveAttribute("aria-roledescription");

    handle.dispatchEvent(
      new window.PointerEvent("pointerdown", { bubbles: true }),
    );
    expect(onPointerDown).not.toHaveBeenCalled();
  });

  it("no bespoke focus-style className is applied to the drag handle: it relies on the same shared global focus-visible mechanism as the title button, not new focus CSS", () => {
    const res = createTextResource({ name: "Test Resource" });
    render(
      <OrganizerCard
        resource={res}
        showBody={true}
        onSelect={vi.fn()}
        dragHandleAttributes={{ "aria-roledescription": "sortable" }}
        dragHandleListeners={{ onPointerDown: vi.fn() }}
      />,
    );

    const handle = screen.getByRole("button", { name: "Drag to reorder" });
    const titleButton = screen.getByRole("button", { name: "Test Resource" });

    // Neither button carries a focus-specific className (e.g. a bespoke
    // "focus:" / "focus-visible:" utility) — both rely purely on the app's
    // existing global :focus-visible mechanism, exactly like the title
    // button precedent asserted elsewhere in this file.
    expect(handle.className).not.toMatch(/focus/);
    expect(titleButton.className).not.toMatch(/focus/);
  });

  it("focusing the handle and dispatching a keydown exercises the wired-up dragHandleListeners (the keyboard-reorder entry point a real useSortable() keyboard handler would occupy); the resulting move + FR-8 announcement are covered by organizerView.test.tsx's Task 5 test, not duplicated here", async () => {
    const onKeyDown = vi.fn();
    const res = createTextResource({ name: "Test Resource" });
    render(
      <OrganizerCard
        resource={res}
        showBody={true}
        onSelect={vi.fn()}
        dragHandleAttributes={{
          "aria-roledescription": "sortable",
          role: "button",
        }}
        dragHandleListeners={{ onKeyDown }}
      />,
    );

    const handle = screen.getByRole("button", { name: "Drag to reorder" });
    handle.focus();
    expect(handle).toHaveFocus();

    handle.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });
});
