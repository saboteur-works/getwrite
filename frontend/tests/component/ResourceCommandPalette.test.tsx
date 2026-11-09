/**
 * The command palette (Cmd/Ctrl+K) shows each resource's type icon before its
 * name, the same icons the resource tree uses (text, image, audio).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResourceCommandPalette from "../../components/common/ResourceCommandPalette";
import { runAxe } from "../a11y/helpers/axe";
import type { AnyResource } from "../../src/lib/models/types";

function resource(id: string, name: string, type: string): AnyResource {
  return {
    id,
    name,
    type,
    createdAt: "2026-01-01T00:00:00.000Z",
  } as AnyResource;
}

describe("ResourceCommandPalette type icons", () => {
  it.each([
    ["Chapter One", "text", "lucide-file-text"],
    ["Map", "image", "lucide-image"],
    ["Theme", "audio", "lucide-music"],
  ])(
    "puts the %s option's %s icon before its name",
    (name, type, iconClass) => {
      render(
        <ResourceCommandPalette
          isOpen
          resources={[resource(`r-${type}`, name, type)]}
          onClose={vi.fn()}
          onSelectResource={vi.fn()}
        />,
      );

      const option = screen.getByRole("option", { name: new RegExp(name) });
      const icon = option.querySelector("svg");
      expect(icon).not.toBeNull();
      expect(icon).toHaveClass(iconClass);
      expect(icon).toHaveAttribute("aria-hidden", "true");

      const label = option.querySelector(".listbox-option-label");
      expect(label).toHaveTextContent(name);
      expect(
        icon!.compareDocumentPosition(label!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    },
  );
});

describe("ResourceCommandPalette Capture row (Feature 106, FR-24)", () => {
  const chapter = resource("r-1", "Chapter One", "text");

  function renderPalette(
    overrides: { onCapture?: () => void; onClose?: () => void } = {},
  ): { onCapture: () => void; onClose: () => void; onSelect: () => void } {
    const onCapture = overrides.onCapture ?? vi.fn();
    const onClose = overrides.onClose ?? vi.fn();
    const onSelect = vi.fn();
    render(
      <ResourceCommandPalette
        isOpen
        resources={[chapter]}
        onClose={onClose}
        onSelectResource={onSelect}
        onCapture={onCapture}
      />,
    );
    return { onCapture, onClose, onSelect };
  }

  it("shows Capture... first for an empty query", () => {
    renderPalette();
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Capture...");
    expect(options[1]).toHaveTextContent("Chapter One");
  });

  it.each(["c", "CAP", "capture", " Capt "])(
    "shows Capture... first for the prefix %j",
    async (query) => {
      renderPalette();
      await userEvent.type(
        screen.getByPlaceholderText("Search resources..."),
        query,
      );
      expect(screen.getAllByRole("option")[0]).toHaveTextContent("Capture...");
    },
  );

  it.each(["note", "captures"])("hides Capture... for %j", async (query) => {
    renderPalette();
    await userEvent.type(
      screen.getByPlaceholderText("Search resources..."),
      query,
    );
    expect(screen.queryByText("Capture...")).toBeNull();
  });

  it("does not show the empty state while Capture is visible, and does when nothing matches", async () => {
    renderPalette();
    const input = screen.getByPlaceholderText("Search resources...");
    await userEvent.type(input, "cap");
    expect(screen.queryByText("No resources match your search.")).toBeNull();
    await userEvent.clear(input);
    await userEvent.type(input, "zzz");
    expect(
      screen.getByText("No resources match your search."),
    ).toBeInTheDocument();
  });

  it("has no Capture row when no onCapture is given", () => {
    render(
      <ResourceCommandPalette
        isOpen
        resources={[chapter]}
        onClose={vi.fn()}
        onSelectResource={vi.fn()}
      />,
    );
    expect(screen.queryByText("Capture...")).toBeNull();
  });

  it("opens Capture and closes on Enter", async () => {
    const { onCapture, onClose, onSelect } = renderPalette();
    await userEvent.type(
      screen.getByPlaceholderText("Search resources..."),
      "{Enter}",
    );
    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("opens Capture and closes on click", async () => {
    const { onCapture, onClose, onSelect } = renderPalette();
    await userEvent.click(
      screen.getByRole("option", { name: /Capture\.\.\./ }),
    );
    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("reaches the Capture row by arrow keys and announces selection", async () => {
    renderPalette();
    const input = screen.getByPlaceholderText("Search resources...");
    await userEvent.type(input, "{ArrowDown}");
    expect(screen.getByRole("option", { name: /Chapter One/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.type(input, "{ArrowUp}");
    expect(
      screen.getByRole("option", { name: /Capture\.\.\./ }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("opens a resource, not Capture, when Enter is pressed on a resource row", async () => {
    const { onCapture, onSelect } = renderPalette();
    await userEvent.type(
      screen.getByPlaceholderText("Search resources..."),
      "{ArrowDown}{Enter}",
    );
    expect(onSelect).toHaveBeenCalledWith("r-1");
    expect(onCapture).not.toHaveBeenCalled();
  });

  it("words the hint for the highlighted row", async () => {
    renderPalette();
    expect(screen.getByText("Enter to open Capture box")).toBeInTheDocument();
    await userEvent.type(
      screen.getByPlaceholderText("Search resources..."),
      "{ArrowDown}",
    );
    expect(screen.getByText("Enter to open")).toBeInTheDocument();
  });

  it("has no axe violations with the Capture row shown", async () => {
    renderPalette();
    await runAxe(document.body);
  });
});
