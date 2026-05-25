import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Chip from "../components/common/UI/Chip/Chip";

describe("Chip", () => {
  it("renders the label", () => {
    render(<Chip label="Draft" shape="sharp" />);
    expect(screen.getByText("Draft")).toBeTruthy();
  });

  it("applies color as inline borderColor and color when provided", () => {
    const { container } = render(
      <Chip label="Status" shape="sharp" color="#4a9e4a" />,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.borderColor).toBe("rgb(74, 158, 74)");
    expect(el.style.color).toBe("rgb(74, 158, 74)");
  });

  it("applies no inline color styles when color is omitted", () => {
    const { container } = render(<Chip label="Status" shape="sharp" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.borderColor).toBe("");
    expect(el.style.color).toBe("");
  });

  it("applies chip--sharp class for shape='sharp'", () => {
    const { container } = render(<Chip label="Tag" shape="sharp" />);
    expect(container.firstChild).toHaveClass("chip--sharp");
  });

  it("applies chip--rounded class for shape='rounded'", () => {
    const { container } = render(<Chip label="Tag" shape="rounded" />);
    expect(container.firstChild).toHaveClass("chip--rounded");
  });

  it("defaults size to md", () => {
    const { container } = render(<Chip label="Tag" shape="sharp" />);
    expect(container.firstChild).toHaveClass("chip--md");
  });

  it("applies chip--sm for size='sm'", () => {
    const { container } = render(<Chip label="Tag" shape="sharp" size="sm" />);
    expect(container.firstChild).toHaveClass("chip--sm");
  });

  it("applies chip--lg for size='lg'", () => {
    const { container } = render(<Chip label="Tag" shape="sharp" size="lg" />);
    expect(container.firstChild).toHaveClass("chip--lg");
  });

  it("renders a span when onClick is omitted", () => {
    const { container } = render(<Chip label="Tag" shape="sharp" />);
    expect(container.firstChild?.nodeName).toBe("SPAN");
  });

  it("renders a button when onClick is provided", () => {
    render(<Chip label="Tag" shape="sharp" onClick={vi.fn()} />);
    expect(screen.getByRole("button")).toBeTruthy();
  });

  it("calls onClick when the button chip is clicked", () => {
    const onClick = vi.fn();
    render(<Chip label="Tag" shape="sharp" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("always applies base chip class", () => {
    const { container } = render(<Chip label="Tag" shape="sharp" />);
    expect(container.firstChild).toHaveClass("chip");
  });

  describe("active state", () => {
    it("adds chip--active class when active=true and no color", () => {
      const { container } = render(
        <Chip label="Tag" shape="sharp" active={true} />,
      );
      expect(container.firstChild).toHaveClass("chip--active");
    });

    it("does not add chip--active class when active=false", () => {
      const { container } = render(
        <Chip label="Tag" shape="sharp" active={false} />,
      );
      expect(container.firstChild).not.toHaveClass("chip--active");
    });

    it("does not add chip--active class when active=true with color (uses inline style instead)", () => {
      const { container } = render(
        <Chip label="Tag" shape="sharp" active={true} color="#4a9e4a" />,
      );
      expect(container.firstChild).not.toHaveClass("chip--active");
    });

    it("active=true with color sets backgroundColor and white text", () => {
      const { container } = render(
        <Chip label="Tag" shape="sharp" active={true} color="#4a9e4a" />,
      );
      const el = container.firstChild as HTMLElement;
      expect(el.style.backgroundColor).toBe("rgb(74, 158, 74)");
      expect(el.style.color).toBe("rgb(255, 255, 255)");
    });

    it("active=false with color keeps border/text color only (no background)", () => {
      const { container } = render(
        <Chip label="Tag" shape="sharp" active={false} color="#4a9e4a" />,
      );
      const el = container.firstChild as HTMLElement;
      expect(el.style.backgroundColor).toBe("");
      expect(el.style.borderColor).toBe("rgb(74, 158, 74)");
    });

    it("button chip with active=true has aria-pressed=true", () => {
      render(
        <Chip label="Tag" shape="sharp" active={true} onClick={vi.fn()} />,
      );
      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("button chip with active=false has aria-pressed=false", () => {
      render(
        <Chip label="Tag" shape="sharp" active={false} onClick={vi.fn()} />,
      );
      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });

    it("button chip without active prop has no aria-pressed attribute", () => {
      render(<Chip label="Tag" shape="sharp" onClick={vi.fn()} />);
      expect(screen.getByRole("button")).not.toHaveAttribute("aria-pressed");
    });
  });

  describe("tooltip", () => {
    it("sets data-tooltip-id and data-tooltip-content when both props provided", () => {
      const { container } = render(
        <Chip
          label="Tag"
          shape="sharp"
          tooltip="More detail"
          tooltipId="chip-tip-1"
        />,
      );
      const root = container.firstChild as HTMLElement;
      expect(root.getAttribute("data-tooltip-id")).toBe("chip-tip-1");
      expect(root.getAttribute("data-tooltip-content")).toBe("More detail");
    });

    it("does not set data-tooltip-id when tooltip is omitted", () => {
      const { container } = render(
        <Chip label="Tag" shape="sharp" tooltipId="chip-tip-2" />,
      );
      const root = container.firstChild as HTMLElement;
      expect(root.getAttribute("data-tooltip-id")).toBeNull();
    });

    it("does not set data-tooltip-id when tooltipId is omitted", () => {
      const { container } = render(
        <Chip label="Tag" shape="sharp" tooltip="Some tip" />,
      );
      const root = container.firstChild as HTMLElement;
      expect(root.getAttribute("data-tooltip-id")).toBeNull();
    });
  });

  describe("dismiss button", () => {
    it("renders dismiss button when onDismiss is provided", () => {
      render(<Chip label="Tag" shape="sharp" onDismiss={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();
    });

    it("does not render dismiss button when onDismiss is omitted", () => {
      render(<Chip label="Tag" shape="sharp" />);
      expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    });

    it("calls onDismiss when dismiss button is clicked", () => {
      const onDismiss = vi.fn();
      render(<Chip label="Tag" shape="sharp" onDismiss={onDismiss} />);
      fireEvent.click(screen.getByRole("button", { name: "Remove" }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("renders a span root (not role=button) when both onClick and onDismiss are provided", () => {
      const { container } = render(
        <Chip
          label="Tag"
          shape="sharp"
          onClick={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      const root = container.firstChild as HTMLElement;
      expect(root.nodeName).toBe("SPAN");
      expect(root.getAttribute("role")).toBeNull();
      expect(root.getAttribute("tabindex")).toBeNull();
    });

    it("calls onClick via label button when both onClick and onDismiss are provided", () => {
      const onClick = vi.fn();
      render(
        <Chip
          label="Tag"
          shape="sharp"
          onClick={onClick}
          onDismiss={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Tag" }));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("dismiss click does not bubble to chip onClick", () => {
      const onClick = vi.fn();
      const onDismiss = vi.fn();
      render(
        <Chip
          label="Tag"
          shape="sharp"
          onClick={onClick}
          onDismiss={onDismiss}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Remove" }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(onClick).not.toHaveBeenCalled();
    });

    it("dismiss button has aria-label Remove", () => {
      render(<Chip label="Tag" shape="sharp" onDismiss={vi.fn()} />);
      const btn = screen.getByRole("button", { name: "Remove" });
      expect(btn.getAttribute("aria-label")).toBe("Remove");
    });

    it("dismiss button has chip__dismiss class", () => {
      render(<Chip label="Tag" shape="sharp" onDismiss={vi.fn()} />);
      const btn = screen.getByRole("button", { name: "Remove" });
      expect(btn).toHaveClass("chip__dismiss");
    });
  });
});
