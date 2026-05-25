import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import useDismissableMenu from "../../components/common/UI/hooks/useDismissableMenu";

function TestMenu({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { containerRef } = useDismissableMenu({ isOpen, onClose });

  return (
    <div data-testid="wrapper">
      <div data-testid="outside">outside</div>
      {isOpen ? (
        <div ref={containerRef} role="menu" data-testid="menu">
          <button type="button" role="menuitem">
            Item A
          </button>
          <button type="button" role="menuitem">
            Item B
          </button>
          <button type="button" role="menuitem">
            Item C
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ControlledTestMenu() {
  const [open, setOpen] = useState(true);
  return <TestMenu isOpen={open} onClose={() => setOpen(false)} />;
}

describe("useDismissableMenu", () => {
  it("closes on outside mousedown", () => {
    const onClose = vi.fn();
    render(<TestMenu isOpen onClose={onClose} />);
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not close when clicking inside the menu", () => {
    const onClose = vi.fn();
    render(<TestMenu isOpen onClose={onClose} />);
    fireEvent.mouseDown(screen.getByText("Item A"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape key", () => {
    const onClose = vi.fn();
    render(<TestMenu isOpen onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not fire onClose when menu is closed and Escape pressed", () => {
    const onClose = vi.fn();
    render(<TestMenu isOpen={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ArrowDown focuses next menuitem", () => {
    render(<ControlledTestMenu />);
    const items = screen.getAllByRole("menuitem");
    items[0].focus();
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
  });

  it("ArrowDown wraps from last to first", () => {
    render(<ControlledTestMenu />);
    const items = screen.getAllByRole("menuitem");
    items[items.length - 1].focus();
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
  });

  it("ArrowUp focuses previous menuitem", () => {
    render(<ControlledTestMenu />);
    const items = screen.getAllByRole("menuitem");
    items[1].focus();
    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[0]);
  });

  it("ArrowUp wraps from first to last", () => {
    render(<ControlledTestMenu />);
    const items = screen.getAllByRole("menuitem");
    items[0].focus();
    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it("removes listeners when isOpen becomes false", () => {
    const onClose = vi.fn();
    const { rerender } = render(<TestMenu isOpen onClose={onClose} />);
    rerender(<TestMenu isOpen={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
