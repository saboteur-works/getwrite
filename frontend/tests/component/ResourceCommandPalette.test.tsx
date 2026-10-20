/**
 * The command palette (Cmd/Ctrl+K) shows each resource's type icon before its
 * name, the same icons the resource tree uses (text, image, audio).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ResourceCommandPalette from "../../components/common/ResourceCommandPalette";
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
