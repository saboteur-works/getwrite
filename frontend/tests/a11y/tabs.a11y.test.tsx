import React, { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../../components/common/UI/Tabs/Tabs";

function ControlledTabs({
  defaultValue = "a",
  onValueChange,
}: {
  defaultValue?: string;
  onValueChange?: (v: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <Tabs
      value={value}
      onValueChange={(v) => {
        setValue(v);
        onValueChange?.(v);
      }}
    >
      <TabsList aria-label="Test tabs">
        <TabsTrigger value="a">Tab A</TabsTrigger>
        <TabsTrigger value="b">Tab B</TabsTrigger>
        <TabsTrigger value="c" disabled>
          Tab C
        </TabsTrigger>
      </TabsList>
      <TabsContent value="a">Panel A</TabsContent>
      <TabsContent value="b">Panel B</TabsContent>
      <TabsContent value="c">Panel C</TabsContent>
    </Tabs>
  );
}

describe("a11y: Tabs primitive", () => {
  it("renders tablist, tabs, and active panel", () => {
    render(<ControlledTabs />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
    expect(screen.getByText("Panel A")).toBeInTheDocument();
  });

  it("active tab has aria-selected=true", () => {
    render(<ControlledTabs defaultValue="b" />);
    expect(screen.getByRole("tab", { name: "Tab B" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Tab A" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("clicking a tab calls onValueChange", () => {
    const onChange = vi.fn();
    render(<ControlledTabs onValueChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "Tab B" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("disabled tab is not selectable via click", () => {
    const onChange = vi.fn();
    render(<ControlledTabs onValueChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "Tab C" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("tab panel is associated with its trigger via aria-controls / aria-labelledby", () => {
    render(<ControlledTabs />);
    const tab = screen.getByRole("tab", { name: "Tab A" });
    const panel = screen.getByRole("tabpanel");
    expect(tab.getAttribute("aria-controls")).toBe(panel.getAttribute("id"));
    expect(panel.getAttribute("aria-labelledby")).toBe(tab.getAttribute("id"));
  });

  it("only the active panel is visible", () => {
    render(<ControlledTabs defaultValue="a" />);
    expect(screen.getByText("Panel A")).toBeInTheDocument();
    expect(screen.queryByText("Panel B")).toBeNull();
  });

  it("ArrowRight moves focus to next tab", () => {
    render(<ControlledTabs />);
    const tabA = screen.getByRole("tab", { name: "Tab A" });
    const tabB = screen.getByRole("tab", { name: "Tab B" });
    tabA.focus();
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabB);
  });

  it("ArrowLeft moves focus to previous tab", () => {
    render(<ControlledTabs defaultValue="b" />);
    const tabA = screen.getByRole("tab", { name: "Tab A" });
    const tabB = screen.getByRole("tab", { name: "Tab B" });
    tabB.focus();
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tabA);
  });
});
