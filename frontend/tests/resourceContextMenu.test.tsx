import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ResourceContextMenu from "../components/ResourceTree/ResourceContextMenu";

function renderMenu(
  props: Partial<React.ComponentProps<typeof ResourceContextMenu>> = {},
) {
  return render(
    <div>
      <div data-testid="outside">Outside</div>
      <ResourceContextMenu
        resourceId="res_test"
        resourceTitle="Test Resource"
        {...props}
      >
        <div data-testid="trigger">Trigger</div>
      </ResourceContextMenu>
    </div>,
  );
}

// Radix DismissableLayer registers its pointerdown listener inside a setTimeout,
// so fake timers must run after opening for outside-click dismissal to work.
function openMenu() {
  fireEvent.contextMenu(screen.getByTestId("trigger"));
  act(() => {
    vi.runAllTimers();
  });
}

describe("ResourceContextMenu", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders menu items and calls onAction for delete", () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    renderMenu({ onAction, onClose });
    openMenu();

    const deleteBtn = screen.getByText("Delete");
    expect(deleteBtn).toBeTruthy();

    fireEvent.click(deleteBtn);
    expect(onAction).toHaveBeenCalledWith("delete", "res_test");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on outside pointer down", () => {
    const onClose = vi.fn();
    renderMenu({ onClose });
    openMenu();

    const menu = screen.getByRole("menu");
    expect(menu).toBeTruthy();

    fireEvent.pointerDown(screen.getByTestId("outside"));
    expect(onClose).toHaveBeenCalled();
  });

  it("does not close when clicking inside the menu", () => {
    const onClose = vi.fn();
    renderMenu({ onClose });
    openMenu();

    const createBtn = screen.getByText("Create");
    fireEvent.pointerDown(createBtn);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders Rename item and calls onAction with 'rename'", () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    renderMenu({ onAction, onClose });
    openMenu();

    const renameBtn = screen.getByText("Rename");
    expect(renameBtn).toBeTruthy();

    fireEvent.click(renameBtn);
    expect(onAction).toHaveBeenCalledWith("rename", "res_test");
    expect(onClose).toHaveBeenCalled();
  });
});
