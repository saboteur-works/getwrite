import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import EditContextMenu from "../components/common/UI/ContextMenu/EditContextMenu";

// jsdom doesn't define execCommand at all, so vi.spyOn won't work.
// Define it before each test and track calls via the mock reference.
let execCommand: ReturnType<typeof vi.fn>;

function renderWithInput(
  inputProps: React.InputHTMLAttributes<HTMLInputElement> = {},
) {
  return render(
    <EditContextMenu>
      <input data-testid="field" defaultValue="hello world" {...inputProps} />
    </EditContextMenu>,
  );
}

function openMenu(selectionStart = 0, selectionEnd = 0) {
  const input = screen.getByTestId("field") as HTMLInputElement;
  input.setSelectionRange(selectionStart, selectionEnd);
  fireEvent.contextMenu(input);
  act(() => vi.runAllTimers());
}

describe("EditContextMenu", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      value: execCommand,
      writable: true,
      configurable: true,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows Cut, Copy, and Paste items", () => {
    renderWithInput();
    openMenu(0, 5);
    expect(screen.getByText("Cut")).toBeTruthy();
    expect(screen.getByText("Copy")).toBeTruthy();
    expect(screen.getByText("Paste")).toBeTruthy();
  });

  it("Cut and Copy are disabled when nothing is selected", () => {
    renderWithInput();
    openMenu(0, 0); // no selection
    expect(screen.getByText("Cut").closest("[data-disabled]")).toBeTruthy();
    expect(screen.getByText("Copy").closest("[data-disabled]")).toBeTruthy();
    expect(screen.getByText("Paste").closest("[data-disabled]")).toBeFalsy();
  });

  it("Cut and Copy are enabled when text is selected", () => {
    renderWithInput();
    openMenu(0, 5); // "hello" selected
    expect(screen.getByText("Cut").closest("[data-disabled]")).toBeFalsy();
    expect(screen.getByText("Copy").closest("[data-disabled]")).toBeFalsy();
  });

  it("Cut is disabled for a readonly input", () => {
    renderWithInput({ readOnly: true });
    openMenu(0, 5);
    expect(screen.getByText("Cut").closest("[data-disabled]")).toBeTruthy();
    expect(screen.getByText("Copy").closest("[data-disabled]")).toBeFalsy();
    expect(screen.getByText("Paste").closest("[data-disabled]")).toBeTruthy();
  });

  it("clicking Copy calls execCommand('copy')", () => {
    renderWithInput();
    openMenu(0, 5);
    fireEvent.click(screen.getByText("Copy"));
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("clicking Cut calls execCommand('cut')", () => {
    renderWithInput();
    openMenu(0, 5);
    fireEvent.click(screen.getByText("Cut"));
    expect(execCommand).toHaveBeenCalledWith("cut");
  });

  it("clicking Paste calls execCommand('paste')", () => {
    renderWithInput();
    openMenu();
    fireEvent.click(screen.getByText("Paste"));
    expect(execCommand).toHaveBeenCalledWith("paste");
  });

  it("works with a textarea", () => {
    render(
      <EditContextMenu>
        <textarea data-testid="area" defaultValue="some text" />
      </EditContextMenu>,
    );
    const area = screen.getByTestId("area") as HTMLTextAreaElement;
    area.setSelectionRange(0, 4);
    fireEvent.contextMenu(area);
    act(() => vi.runAllTimers());
    expect(screen.getByText("Cut").closest("[data-disabled]")).toBeFalsy();
  });
});
