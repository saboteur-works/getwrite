import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CollapsibleSection from "../../components/common/UI/CollapsibleSection/CollapsibleSection";

describe("a11y: CollapsibleSection primitive", () => {
  it("workarea: toggle button has type=button", () => {
    render(
      <CollapsibleSection title="Resources">
        <span>content</span>
      </CollapsibleSection>,
    );
    expect(screen.getByRole("button", { name: /resources/i })).toHaveAttribute(
      "type",
      "button",
    );
  });

  it("workarea: aria-expanded is true when open", () => {
    render(
      <CollapsibleSection title="Resources">
        <span>content</span>
      </CollapsibleSection>,
    );
    expect(screen.getByRole("button", { name: /resources/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("workarea: aria-expanded toggles on click", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="Resources">
        <span>content</span>
      </CollapsibleSection>,
    );
    const btn = screen.getByRole("button", { name: /resources/i });
    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  it("workarea: aria-controls points to the visible content region", () => {
    render(
      <CollapsibleSection title="Resources">
        <p data-testid="content">Content</p>
      </CollapsibleSection>,
    );
    const btn = screen.getByRole("button", { name: /resources/i });
    const controlsId = btn.getAttribute("aria-controls")!;
    const region = document.getElementById(controlsId);
    expect(region).toBeTruthy();
    expect(region).toContainElement(screen.getByTestId("content"));
  });

  it("workarea: keyboard activation via Enter toggles the section", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="Data">
        <p data-testid="content">Content</p>
      </CollapsibleSection>,
    );
    const btn = screen.getByRole("button", { name: /data/i });
    btn.focus();
    await user.keyboard("{Enter}");
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("sidebar: toggle button has type=button", () => {
    render(
      <CollapsibleSection title="Tags" variant="sidebar">
        <span>content</span>
      </CollapsibleSection>,
    );
    expect(screen.getByRole("button", { name: /tags/i })).toHaveAttribute(
      "type",
      "button",
    );
  });

  it("sidebar: aria-expanded is true when open", () => {
    render(
      <CollapsibleSection title="Tags" variant="sidebar">
        <span>content</span>
      </CollapsibleSection>,
    );
    expect(screen.getByRole("button", { name: /tags/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("sidebar: aria-expanded toggles on click", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="Tags" variant="sidebar">
        <span>content</span>
      </CollapsibleSection>,
    );
    const btn = screen.getByRole("button", { name: /tags/i });
    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  it("sidebar: aria-controls points to the visible content region", () => {
    render(
      <CollapsibleSection title="Synopsis" variant="sidebar">
        <p data-testid="synopsis-content">Content</p>
      </CollapsibleSection>,
    );
    const btn = screen.getByRole("button", { name: /synopsis/i });
    const controlsId = btn.getAttribute("aria-controls")!;
    const region = document.getElementById(controlsId);
    expect(region).toBeTruthy();
    expect(region).toContainElement(screen.getByTestId("synopsis-content"));
  });

  it("onToggle callback fires with correct open state", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <CollapsibleSection title="Notes" onToggle={onToggle}>
        <span>content</span>
      </CollapsibleSection>,
    );
    await user.click(screen.getByRole("button", { name: /notes/i }));
    expect(onToggle).toHaveBeenCalledWith(false);
    await user.click(screen.getByRole("button", { name: /notes/i }));
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});
