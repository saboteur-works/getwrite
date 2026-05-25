import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Listbox from "../../components/common/UI/Listbox/Listbox";
import type { ListboxOption } from "../../components/common/UI/Listbox/Listbox";

const OPTIONS: ListboxOption[] = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry", meta: "Text" },
];

describe("a11y: Listbox primitive", () => {
  it("renders with role=listbox and options as role=option", () => {
    render(
      <Listbox options={OPTIONS} highlightedIndex={0} onSelect={vi.fn()} />,
    );
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("returns null when options array is empty", () => {
    const { container } = render(
      <Listbox options={[]} highlightedIndex={-1} onSelect={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("highlighted option has aria-selected=true", () => {
    render(
      <Listbox options={OPTIONS} highlightedIndex={1} onSelect={vi.fn()} />,
    );
    const opts = screen.getAllByRole("option");
    expect(opts[0]).toHaveAttribute("aria-selected", "false");
    expect(opts[1]).toHaveAttribute("aria-selected", "true");
    expect(opts[2]).toHaveAttribute("aria-selected", "false");
  });

  it("clicking an option calls onSelect with its value", () => {
    const onSelect = vi.fn();
    render(
      <Listbox options={OPTIONS} highlightedIndex={0} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByText("Banana"));
    expect(onSelect).toHaveBeenCalledWith("banana");
  });

  it("mouseEnter calls onHighlightChange with the option index", () => {
    const onHighlightChange = vi.fn();
    render(
      <Listbox
        options={OPTIONS}
        highlightedIndex={0}
        onSelect={vi.fn()}
        onHighlightChange={onHighlightChange}
      />,
    );
    fireEvent.mouseEnter(screen.getByText("Cherry").closest("button")!);
    expect(onHighlightChange).toHaveBeenCalledWith(2);
  });

  it("renders meta label when provided", () => {
    render(
      <Listbox options={OPTIONS} highlightedIndex={0} onSelect={vi.fn()} />,
    );
    expect(screen.getByText("Text")).toBeInTheDocument();
  });

  it("accepts custom aria-label", () => {
    render(
      <Listbox
        options={OPTIONS}
        highlightedIndex={0}
        onSelect={vi.fn()}
        aria-label="Resource results"
      />,
    );
    expect(
      screen.getByRole("listbox", { name: "Resource results" }),
    ).toBeInTheDocument();
  });
});
