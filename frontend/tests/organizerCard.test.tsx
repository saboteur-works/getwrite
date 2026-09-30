import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import OrganizerCard from "../components/WorkArea/Views/OrganizerView/OrganizerCard";
import {
  createTextResource,
  createImageResource,
  createAudioResource,
  createFolderResource,
} from "../src/lib/models/resource";

describe("OrganizerCard", () => {
  it("renders title, type, date, body and metadata when showBody is true", () => {
    const plainText = Array.from({ length: 42 }, (_, i) => `word${i + 1}`).join(
      " ",
    );
    const res = createTextResource({
      name: "Test Resource",
      plainText,
      userMetadata: { status: "draft" },
    });

    render(
      <OrganizerCard
        resource={res}
        showBody={true}
        body="Placeholder content for Test Resource"
      />,
    );

    expect(screen.getByText("Test Resource")).toBeTruthy();
    expect(screen.getByText(/text/i)).toBeTruthy();
    expect(screen.getByText(/Words:/i)).toHaveTextContent("42");
    expect(screen.getByText(/Status:/i)).toHaveTextContent("draft");
    // body/content should be visible
    expect(
      screen.getByText(/Placeholder content for Test Resource/i),
    ).toBeTruthy();
  });

  it("hides the body when showBody is false", () => {
    const res = createTextResource({ name: "Hidden Body" });
    render(
      <OrganizerCard
        resource={res}
        showBody={false}
        body="Placeholder content for Hidden Body"
      />,
    );

    expect(screen.getByText("Hidden Body")).toBeTruthy();
    // body text should not be present
    expect(
      screen.queryByText(/Placeholder content for Hidden Body/i),
    ).toBeNull();
  });

  it("renders no body section when body is undefined", () => {
    const res = createTextResource({ name: "No Body" });
    render(<OrganizerCard resource={res} showBody={true} />);

    expect(screen.getByText("No Body")).toBeTruthy();
    expect(screen.queryByText(/No notes available/i)).toBeNull();
  });

  describe("per-type icon (FR-1, FR-2)", () => {
    it("renders the text-resource icon and no other kind's icon", () => {
      const res = createTextResource({ name: "Text Resource" });
      const { container } = render(<OrganizerCard resource={res} />);

      expect(container.querySelector(".lucide-file-text")).toBeTruthy();
      expect(container.querySelector(".lucide-image")).toBeNull();
      expect(container.querySelector(".lucide-music")).toBeNull();
      expect(container.querySelector(".lucide-folder")).toBeNull();
    });

    it("renders the image-resource icon and no other kind's icon", () => {
      const res = createImageResource({ name: "Image Resource" });
      const { container } = render(<OrganizerCard resource={res} />);

      expect(container.querySelector(".lucide-image")).toBeTruthy();
      expect(container.querySelector(".lucide-file-text")).toBeNull();
      expect(container.querySelector(".lucide-music")).toBeNull();
      expect(container.querySelector(".lucide-folder")).toBeNull();
    });

    it("renders the audio-resource icon and no other kind's icon", () => {
      const res = createAudioResource({ name: "Audio Resource" });
      const { container } = render(<OrganizerCard resource={res} />);

      expect(container.querySelector(".lucide-music")).toBeTruthy();
      expect(container.querySelector(".lucide-file-text")).toBeNull();
      expect(container.querySelector(".lucide-image")).toBeNull();
      expect(container.querySelector(".lucide-folder")).toBeNull();
    });

    it("renders the folder icon and no other kind's icon", () => {
      const res = createFolderResource({ name: "Folder Resource" });
      const { container } = render(<OrganizerCard resource={res} />);

      expect(container.querySelector(".lucide-folder")).toBeTruthy();
      expect(container.querySelector(".lucide-file-text")).toBeNull();
      expect(container.querySelector(".lucide-image")).toBeNull();
      expect(container.querySelector(".lucide-music")).toBeNull();
    });
  });

  describe("clickable title (FR-3, FR-5, FR-6)", () => {
    it("is queryable as a real button by its accessible name when onSelect is provided (no onOpen)", () => {
      const res = createTextResource({ name: "Clickable Title" });
      render(<OrganizerCard resource={res} onSelect={() => {}} />);

      expect(
        screen.getByRole("button", { name: "Clickable Title" }),
      ).toBeTruthy();
    });

    it("calls onSelect from the title button and the distinct onOpen prop from the footer Open button (FR-3, FR-6)", () => {
      const onSelect = vi.fn();
      const onOpen = vi.fn();
      const res = createTextResource({ name: "Split Handlers" });
      render(
        <OrganizerCard resource={res} onSelect={onSelect} onOpen={onOpen} />,
      );

      screen.getByRole("button", { name: "Split Handlers" }).click();
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onOpen).not.toHaveBeenCalled();

      screen.getByRole("button", { name: "Open" }).click();
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledTimes(1);
    });
  });

  describe("selected-state styling (Task 16, FR-8)", () => {
    it("applies the resource-tree-item--selected class to the outer card when isSelected is true", () => {
      const res = createTextResource({ name: "Selected Card" });
      const { container } = render(
        <OrganizerCard resource={res} isSelected={true} />,
      );

      const article = container.querySelector("article");
      expect(article?.className).toContain("resource-tree-item--selected");
    });

    it("omits the resource-tree-item--selected class when isSelected is false or not provided", () => {
      const resFalse = createTextResource({ name: "Explicitly Unselected" });
      const { container: containerFalse } = render(
        <OrganizerCard resource={resFalse} isSelected={false} />,
      );
      expect(containerFalse.querySelector("article")?.className).not.toContain(
        "resource-tree-item--selected",
      );

      const resDefault = createTextResource({ name: "Default Unselected" });
      const { container: containerDefault } = render(
        <OrganizerCard resource={resDefault} />,
      );
      expect(
        containerDefault.querySelector("article")?.className,
      ).not.toContain("resource-tree-item--selected");
    });
  });

  describe("drag handle (Task 2, FR-1, FR-2, FR-5, OQ-3)", () => {
    it("renders the grip drag handle receiving drag attributes/listeners when enabled", () => {
      const onDragStart = vi.fn();
      const res = createTextResource({ name: "Draggable Card" });
      const { container } = render(
        <OrganizerCard
          resource={res}
          dragHandleAttributes={{ "aria-roledescription": "sortable" }}
          dragHandleListeners={{ onPointerDown: onDragStart }}
        />,
      );

      expect(container.querySelector(".lucide-grip-vertical")).toBeTruthy();
      const handle = screen.getByRole("button", { name: "Drag to reorder" });
      expect(handle.getAttribute("aria-roledescription")).toBe("sortable");
      expect(handle.getAttribute("aria-disabled")).toBeNull();
      expect(handle.tabIndex).toBe(0);

      handle.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      expect(onDragStart).toHaveBeenCalledTimes(1);
    });

    it("renders the handle visibly disabled and withholds drag attributes/listeners when isDragDisabled is true", () => {
      const onDragStart = vi.fn();
      const res = createTextResource({ name: "Locked Card" });
      render(
        <OrganizerCard
          resource={res}
          isDragDisabled
          dragDisabledReason="Reordering is unavailable while filtered"
          dragHandleAttributes={{ "aria-roledescription": "sortable" }}
          dragHandleListeners={{ onPointerDown: onDragStart }}
        />,
      );

      const handle = screen.getByRole("button", { name: "Drag to reorder" });
      expect(handle.getAttribute("aria-disabled")).toBe("true");
      expect(handle.tabIndex).toBe(-1);
      expect(handle.getAttribute("aria-roledescription")).toBeNull();
      expect(handle.getAttribute("title")).toBe(
        "Reordering is unavailable while filtered",
      );
      const describedBy = handle.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy as string)?.textContent).toBe(
        "Reordering is unavailable while filtered",
      );

      handle.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      expect(onDragStart).not.toHaveBeenCalled();
    });

    it("does not give the title button or Open button drag attributes/listeners", () => {
      const onDragStart = vi.fn();
      const res = createTextResource({ name: "Split Handle Card" });
      render(
        <OrganizerCard
          resource={res}
          onSelect={() => {}}
          onOpen={() => {}}
          dragHandleAttributes={{ "aria-roledescription": "sortable" }}
          dragHandleListeners={{ onPointerDown: onDragStart }}
        />,
      );

      const titleButton = screen.getByRole("button", {
        name: "Split Handle Card",
      });
      const openButton = screen.getByRole("button", { name: "Open" });
      expect(titleButton.getAttribute("aria-roledescription")).toBeNull();
      expect(openButton.getAttribute("aria-roledescription")).toBeNull();
    });
  });

  describe("selected-state inline style (Task 19, FR-8 CSS-layer fix)", () => {
    it("applies the border-left and background-color inline style when isSelected is true", () => {
      const res = createTextResource({ name: "Selected Card Style" });
      const { container } = render(
        <OrganizerCard resource={res} isSelected={true} />,
      );

      const article = container.querySelector("article") as HTMLElement;
      expect(article.style.borderLeft).toBe(
        "2px solid var(--color-gw-red-border)",
      );
      expect(article.style.backgroundColor).toBe("var(--color-gw-chrome2)");
    });

    it("applies no inline border-left/background-color style when isSelected is false or omitted", () => {
      const resFalse = createTextResource({ name: "Unselected Card Style" });
      const { container: containerFalse } = render(
        <OrganizerCard resource={resFalse} isSelected={false} />,
      );
      const articleFalse = containerFalse.querySelector(
        "article",
      ) as HTMLElement;
      expect(articleFalse.style.borderLeft).toBe("");
      expect(articleFalse.style.backgroundColor).toBe("");

      const resDefault = createTextResource({
        name: "Default Unselected Card Style",
      });
      const { container: containerDefault } = render(
        <OrganizerCard resource={resDefault} />,
      );
      const articleDefault = containerDefault.querySelector(
        "article",
      ) as HTMLElement;
      expect(articleDefault.style.borderLeft).toBe("");
      expect(articleDefault.style.backgroundColor).toBe("");
    });
  });
});
