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
  it("showBody=true, onOpen set: zero axe violations", async () => {
    const res = createTextResource({ name: "Test Resource" });
    const { container } = render(
      <OrganizerCard
        resource={res}
        showBody={true}
        body="Placeholder content"
        onOpen={vi.fn()}
      />,
    );
    await runAxe(container);
  });

  it("showBody=false, onOpen set: zero axe violations", async () => {
    const res = createTextResource({ name: "Test Resource" });
    const { container } = render(
      <OrganizerCard resource={res} showBody={false} onOpen={vi.fn()} />,
    );
    await runAxe(container);
  });

  it('the title element is a real, natively-keyboard-operable <button> (no role="button" widget)', () => {
    const res = createTextResource({ name: "Test Resource" });
    const { container } = render(
      <OrganizerCard resource={res} showBody={true} onOpen={vi.fn()} />,
    );

    const titleButton = screen.getByRole("button", { name: "Test Resource" });
    expect(titleButton.tagName).toBe("BUTTON");

    // No non-native widget (e.g. a div/span with role="button") was
    // introduced for the title.
    expect(container.querySelectorAll('[role="button"]').length).toBe(0);
  });

  it("the title button has an accessible name equal to the resource's title", () => {
    const res = createTextResource({ name: "Test Resource" });
    render(<OrganizerCard resource={res} showBody={true} onOpen={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Test Resource" }),
    ).toBeInTheDocument();
  });

  it("the title button is keyboard-operable: focus + Enter invokes onOpen", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    const res = createTextResource({ name: "Test Resource" });
    render(<OrganizerCard resource={res} showBody={true} onOpen={onOpen} />);

    const titleButton = screen.getByRole("button", { name: "Test Resource" });
    titleButton.focus();
    expect(titleButton).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
