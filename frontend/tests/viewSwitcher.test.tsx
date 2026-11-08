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

    const entitiesTab = screen.getByRole("tab", { name: /Entities/i });
    expect(entitiesTab).toBeTruthy();
    fireEvent.click(entitiesTab);
    expect(onChange).toHaveBeenCalledWith("entityRoster");

    const graphTab = screen.getByRole("tab", { name: /Graph/i });
    expect(graphTab).toBeTruthy();
    fireEvent.click(graphTab);
    expect(onChange).toHaveBeenCalledWith("entityGraph");
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

  it("renders the Trash tab unconditionally, unlike Entities/Graph", () => {
    // No `disabledViews`/`disabledReasons` mocked either way — the Trash tab
    // must be present and enabled regardless, per FR-1 (it is deliberately
    // never added to AppShell.tsx's `disabledViews` computation).
    render(<ViewSwitcher view="edit" onChange={vi.fn()} />);

    const trashTab = screen.getByRole("tab", { name: /Trash/i });
    expect(trashTab).toBeTruthy();
    expect(trashTab).not.toBeDisabled();
  });

  it("selecting the Trash tab does not require a selectedResource", () => {
    // ViewSwitcher itself carries no notion of a selected resource — this
    // confirms the tab is clickable and fires onChange from a plain render,
    // with no selection-related props supplied at all.
    const onChange = vi.fn();
    render(<ViewSwitcher view="edit" onChange={onChange} />);

    const trashTab = screen.getByRole("tab", { name: /Trash/i });
    fireEvent.click(trashTab);
    expect(onChange).toHaveBeenCalledWith("trash");
  });

  describe("characterization of the view set (Feature 103 Task 11)", () => {
    const EXPECTED: ReadonlyArray<readonly [string, string]> = [
      ["Edit", "edit"],
      ["Organizer", "organizer"],
      ["Data", "data"],
      ["Diff", "diff"],
      ["Timeline", "timeline"],
      ["Entities", "entityRoster"],
      ["Graph", "entityGraph"],
      ["Trash", "trash"],
    ];

    it("renders exactly the eight existing views in order", () => {
      render(<ViewSwitcher view="edit" onChange={vi.fn()} />);
      const labels = screen
        .getAllByRole("tab")
        .map((t: HTMLElement) => t.textContent?.trim());
      expect(labels).toEqual(EXPECTED.map(([label]) => label));
    });

    it.each(EXPECTED)("%s tab reports the %s view name", (label, key) => {
      const onChange = vi.fn();
      const current = key === "edit" ? "data" : "edit";
      render(<ViewSwitcher view={current} onChange={onChange} />);
      fireEvent.click(screen.getByRole("tab", { name: label }));
      expect(onChange).toHaveBeenCalledWith(key);
    });

    it("disables every view named in disabledViews and no other, from a list or a function", () => {
      const names = ["edit", "diff", "timeline"] as const;
      const { unmount } = render(
        <ViewSwitcher
          view="data"
          onChange={vi.fn()}
          disabledViews={[...names]}
        />,
      );
      const off = () =>
        screen
          .getAllByRole("tab")
          .filter((t: HTMLElement) => t.hasAttribute("disabled"))
          .map((t: HTMLElement) => t.textContent?.trim());
      expect(off()).toEqual(["Edit", "Diff", "Timeline"]);
      unmount();
      render(
        <ViewSwitcher
          view="data"
          onChange={vi.fn()}
          disabledViews={() => [...names]}
        />,
      );
      expect(off()).toEqual(["Edit", "Diff", "Timeline"]);
    });

    it("shows a reason only on a disabled view that has one", () => {
      render(
        <ViewSwitcher
          view="data"
          onChange={vi.fn()}
          disabledViews={["diff", "entityRoster"]}
          disabledReasons={{ entityRoster: "Entities are off." }}
        />,
      );
      expect(
        screen
          .getByRole("tab", { name: /Entities/i })
          .closest("[data-tooltip-content]"),
      ).toHaveAttribute("data-tooltip-content", "Entities are off.");
      expect(
        screen
          .getByRole("tab", { name: /Diff/i })
          .closest("[data-tooltip-content]"),
      ).toBeNull();
    });

    it("relabels the edit tab only through editLabel", () => {
      render(<ViewSwitcher view="edit" onChange={vi.fn()} editLabel="Media" />);
      expect(screen.getByRole("tab", { name: "Media" })).toBeTruthy();
      expect(screen.queryByRole("tab", { name: "Edit" })).toBeNull();
    });
  });

  describe("right-edge fade", () => {
    function stubWidths(scrollWidth: number, clientWidth: number) {
      const sw = vi
        .spyOn(HTMLElement.prototype, "scrollWidth", "get")
        .mockReturnValue(scrollWidth);
      const cw = vi
        .spyOn(HTMLElement.prototype, "clientWidth", "get")
        .mockReturnValue(clientWidth);
      return () => {
        sw.mockRestore();
        cw.mockRestore();
      };
    }

    function frame(): HTMLElement {
      return screen
        .getByRole("tablist", { name: "Work area views" })
        .closest("[data-view-tabs-frame]") as HTMLElement;
    }

    it("fades the right edge while tabs are hidden to the right", () => {
      const restore = stubWidths(900, 400);
      render(<ViewSwitcher view="edit" onChange={vi.fn()} />);

      expect(frame()).toHaveAttribute("data-more-right");
      restore();
    });

    it("drops the fade once the row is scrolled to its end", () => {
      const restore = stubWidths(900, 400);
      render(<ViewSwitcher view="edit" onChange={vi.fn()} />);
      const scroller = frame().querySelector(
        ".workarea-view-tabs-scroll",
      ) as HTMLElement;

      scroller.scrollLeft = 500;
      fireEvent.scroll(scroller);

      expect(frame()).not.toHaveAttribute("data-more-right");
      restore();
    });

    it("does not fade when every tab fits", () => {
      const restore = stubWidths(400, 400);
      render(<ViewSwitcher view="edit" onChange={vi.fn()} />);

      expect(frame()).not.toHaveAttribute("data-more-right");
      restore();
    });
  });
});
