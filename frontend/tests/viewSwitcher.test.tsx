import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ViewSwitcher from "../components/WorkArea/ViewSwitcher";

describe("ViewSwitcher", () => {
  it("renders all view buttons and calls onChange when clicked", () => {
    const onChange = vi.fn();
    render(<ViewSwitcher view="edit" onChange={onChange} />);

    const organizer = screen.getByRole("tab", { name: /Organizer/i });
    expect(organizer).toBeTruthy();

    fireEvent.click(organizer);
    expect(onChange).toHaveBeenCalledWith("organizer");

    const dataBtn = screen.getByRole("tab", { name: /Data/i });
    fireEvent.click(dataBtn);
    expect(onChange).toHaveBeenCalledWith("data");
  });

  it("wraps a disabled view with a tooltip anchor carrying its reason", () => {
    render(
      <ViewSwitcher
        view="edit"
        onChange={vi.fn()}
        disabledViews={["timeline"]}
        disabledReasons={{ timeline: "Turn on the Timeline view in settings." }}
      />,
    );

    const timelineTab = screen.getByRole("tab", { name: /Timeline/i });
    expect(timelineTab).toBeDisabled();
    // The disabled trigger is wrapped in a hover target carrying the reason.
    const anchor = timelineTab.closest("[data-tooltip-content]");
    expect(anchor).not.toBeNull();
    expect(anchor).toHaveAttribute(
      "data-tooltip-content",
      "Turn on the Timeline view in settings.",
    );
  });

  it("does not add a tooltip anchor to an enabled view", () => {
    render(
      <ViewSwitcher
        view="edit"
        onChange={vi.fn()}
        disabledReasons={{ timeline: "unused while enabled" }}
      />,
    );

    const timelineTab = screen.getByRole("tab", { name: /Timeline/i });
    expect(timelineTab.closest("[data-tooltip-content]")).toBeNull();
  });
});
