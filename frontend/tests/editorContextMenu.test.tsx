import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import EditorContextMenu from "../components/Editor/EditorContextMenu";

// Radix DismissableLayer registers its pointerdown listener inside a
// setTimeout, so fake timers must run after opening for the menu's own
// lifecycle (outside-click dismissal, etc.) to settle. Mirrors
// resourceContextMenu.test.tsx / editContextMenu.test.tsx.
function openMenu(target: HTMLElement) {
  return fireEvent.contextMenu(target);
}

function renderWithContent() {
  return render(
    <div>
      <div data-testid="outside">Outside the editor</div>
      <EditorContextMenu>
        <div data-testid="prosemirror" className="ProseMirror">
          Some document text
        </div>
      </EditorContextMenu>
    </div>,
  );
}

describe("EditorContextMenu", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens an (empty) Radix menu anchored at the pointer on right-click inside the editor content", () => {
    renderWithContent();
    openMenu(screen.getByTestId("prosemirror"));
    act(() => vi.runAllTimers());

    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("prevents the browser's native context menu from also appearing (FR-1)", () => {
    renderWithContent();
    const target = screen.getByTestId("prosemirror");
    const wasNotCancelled = fireEvent.contextMenu(target);
    act(() => vi.runAllTimers());

    // fireEvent/dispatchEvent returns false when the event's default action
    // (the browser's native context menu) was prevented.
    expect(wasNotCancelled).toBe(false);
  });

  it("does not render a menu for a right-click outside the editor content", () => {
    renderWithContent();
    fireEvent.contextMenu(screen.getByTestId("outside"));
    act(() => vi.runAllTimers());

    expect(screen.queryByRole("menu")).toBeNull();
  });
});
