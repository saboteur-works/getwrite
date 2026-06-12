import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import NodeTypeIndicator from "../components/WorkArea/NodeTypeIndicator";

describe("NodeTypeIndicator", () => {
  it("renders a single node-type label", () => {
    render(<NodeTypeIndicator types={["Heading 2"]} />);
    expect(screen.getByText("Heading 2")).toBeDefined();
  });

  it("comma-joins multiple types when within the visible cap", () => {
    render(<NodeTypeIndicator types={["Heading 2", "Body"]} />);
    expect(screen.getByText("Heading 2, Body")).toBeDefined();
  });

  it("truncates past the cap to a +N summary and keeps the full list in the tooltip", () => {
    const types = ["Heading 1", "Body", "Bullet List", "Blockquote"];
    render(<NodeTypeIndicator types={types} maxVisibleTypes={2} />);
    const value = screen.getByText("Heading 1, Body +2");
    expect(value.getAttribute("data-tooltip-content")).toBe(types.join(", "));
    expect(value.getAttribute("aria-label")).toBe(types.join(", "));
  });

  it("does not set a tooltip when the list is shown in full", () => {
    render(<NodeTypeIndicator types={["Body"]} />);
    const value = screen.getByText("Body");
    expect(value.getAttribute("data-tooltip-content")).toBeNull();
    expect(value.getAttribute("data-tooltip-id")).toBeNull();
  });

  it("renders a neutral placeholder when there are no types", () => {
    render(<NodeTypeIndicator types={[]} />);
    const value = screen.getByText("—");
    expect(value.getAttribute("aria-label")).toBe("No node selected");
  });

  it("treats a maxVisibleTypes below 1 as 1", () => {
    render(
      <NodeTypeIndicator types={["Body", "Heading 1"]} maxVisibleTypes={0} />,
    );
    expect(screen.getByText("Body +1")).toBeDefined();
  });
});
