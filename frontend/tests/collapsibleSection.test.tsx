import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CollapsibleSection from "../components/common/UI/CollapsibleSection/CollapsibleSection";

describe("CollapsibleSection", () => {
  it("renders children when open by default", () => {
    render(
      <CollapsibleSection title="Data">
        <p data-testid="content">Hello</p>
      </CollapsibleSection>,
    );
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("renders the title in the toggle button", () => {
    render(
      <CollapsibleSection title="Writing Goal">
        <span>content</span>
      </CollapsibleSection>,
    );
    expect(
      screen.getByRole("button", { name: /writing goal/i }),
    ).toBeInTheDocument();
  });

  it("renders a workarea-section wrapper element", () => {
    const { container } = render(
      <CollapsibleSection title="Resources">
        <span>content</span>
      </CollapsibleSection>,
    );
    expect(container.querySelector(".workarea-section")).toBeTruthy();
  });

  it("does not render children when defaultOpen is false", () => {
    render(
      <CollapsibleSection title="Breakdown" defaultOpen={false}>
        <p data-testid="hidden-content">Hidden</p>
      </CollapsibleSection>,
    );
    expect(screen.queryByTestId("hidden-content")).not.toBeInTheDocument();
  });

  it("still renders the toggle button when defaultOpen is false", () => {
    render(
      <CollapsibleSection title="Breakdown" defaultOpen={false}>
        <span>content</span>
      </CollapsibleSection>,
    );
    expect(
      screen.getByRole("button", { name: /breakdown/i }),
    ).toBeInTheDocument();
  });

  it("hides children when toggle is clicked while open", () => {
    render(
      <CollapsibleSection title="Resources">
        <p data-testid="content">Content</p>
      </CollapsibleSection>,
    );
    expect(screen.getByTestId("content")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /resources/i }));
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
  });

  it("shows children when toggle is clicked while collapsed", () => {
    render(
      <CollapsibleSection title="Writing Goal" defaultOpen={false}>
        <p data-testid="content">Content</p>
      </CollapsibleSection>,
    );
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /writing goal/i }));
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("restores children after collapse then expand", () => {
    render(
      <CollapsibleSection title="Data">
        <p data-testid="content">Content</p>
      </CollapsibleSection>,
    );
    fireEvent.click(screen.getByRole("button", { name: /data/i }));
    fireEvent.click(screen.getByRole("button", { name: /data/i }));
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("toggle button has aria-expanded=true when open", () => {
    render(
      <CollapsibleSection title="Data">
        <span>content</span>
      </CollapsibleSection>,
    );
    expect(screen.getByRole("button", { name: /data/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("toggle button has aria-expanded=false when collapsed", () => {
    render(
      <CollapsibleSection title="Data" defaultOpen={false}>
        <span>content</span>
      </CollapsibleSection>,
    );
    expect(screen.getByRole("button", { name: /data/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("updates aria-expanded to false after clicking to collapse", () => {
    render(
      <CollapsibleSection title="Data">
        <span>content</span>
      </CollapsibleSection>,
    );
    const btn = screen.getByRole("button", { name: /data/i });
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("toggle button has a non-empty aria-controls attribute", () => {
    render(
      <CollapsibleSection title="Resources">
        <span>content</span>
      </CollapsibleSection>,
    );
    const btn = screen.getByRole("button", { name: /resources/i });
    expect(btn.getAttribute("aria-controls")).toBeTruthy();
  });

  it("aria-controls points to the content region when open", () => {
    render(
      <CollapsibleSection title="Resources">
        <p data-testid="content">Content</p>
      </CollapsibleSection>,
    );
    const btn = screen.getByRole("button", { name: /resources/i });
    const controlsId = btn.getAttribute("aria-controls")!;
    const contentRegion = document.getElementById(controlsId);
    expect(contentRegion).toBeTruthy();
    expect(contentRegion).toContainElement(screen.getByTestId("content"));
  });

  it("does not render actions when collapsed", () => {
    render(
      <CollapsibleSection
        title="Resources"
        defaultOpen={false}
        actions={
          <button type="button" data-testid="sort-btn">
            Sort
          </button>
        }
      >
        <span>content</span>
      </CollapsibleSection>,
    );
    expect(screen.queryByTestId("sort-btn")).not.toBeInTheDocument();
  });

  it("renders actions when open", () => {
    render(
      <CollapsibleSection
        title="Resources"
        actions={
          <button type="button" data-testid="sort-btn">
            Sort
          </button>
        }
      >
        <span>content</span>
      </CollapsibleSection>,
    );
    expect(screen.getByTestId("sort-btn")).toBeInTheDocument();
  });

  it("hides actions after collapsing", () => {
    render(
      <CollapsibleSection
        title="Resources"
        actions={
          <button type="button" data-testid="sort-btn">
            Sort
          </button>
        }
      >
        <span>content</span>
      </CollapsibleSection>,
    );
    fireEvent.click(screen.getByRole("button", { name: /resources/i }));
    expect(screen.queryByTestId("sort-btn")).not.toBeInTheDocument();
  });
});
