import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Card from "../../components/common/UI/Card/Card";

describe("a11y: Card primitive", () => {
  it("renders a div by default with children", () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("applies chrome variant background class by default", () => {
    const { container } = render(<Card>Content</Card>);
    expect(container.firstChild).toHaveClass("bg-gw-chrome");
  });

  it("applies chrome2 variant background class", () => {
    const { container } = render(<Card variant="chrome2">Content</Card>);
    expect(container.firstChild).toHaveClass("bg-gw-chrome2");
  });

  it("applies border and rounded classes", () => {
    const { container } = render(<Card>Content</Card>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("border-[0.5px]");
    expect(el.className).toContain("border-gw-border");
  });

  it("applies md padding by default", () => {
    const { container } = render(<Card>Content</Card>);
    expect(container.firstChild).toHaveClass("p-4");
  });

  it("applies sm padding", () => {
    const { container } = render(<Card padding="sm">Content</Card>);
    expect(container.firstChild).toHaveClass("p-3");
  });

  it("applies lg padding", () => {
    const { container } = render(<Card padding="lg">Content</Card>);
    expect(container.firstChild).toHaveClass("p-5");
  });

  it("applies no padding when padding=none", () => {
    const { container } = render(<Card padding="none">Content</Card>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).not.toContain("p-3");
    expect(el.className).not.toContain("p-4");
    expect(el.className).not.toContain("p-5");
  });

  it("renders as article when as=article", () => {
    const { container } = render(
      <Card as="article" aria-label="resource card">
        Content
      </Card>,
    );
    expect(container.querySelector("article")).toBeInTheDocument();
  });

  it("renders as section when as=section", () => {
    const { container } = render(
      <Card as="section" aria-label="settings section">
        Content
      </Card>,
    );
    expect(container.querySelector("section")).toBeInTheDocument();
  });

  it("merges caller className with variant classes", () => {
    const { container } = render(<Card className="h-48">Content</Card>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("h-48");
    expect(el.className).toContain("bg-gw-chrome");
  });

  it("forwards aria attributes to the element", () => {
    const { container } = render(
      <Card aria-label="organizer card">Content</Card>,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute("aria-label")).toBe("organizer card");
  });
});
