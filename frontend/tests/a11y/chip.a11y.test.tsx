import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Chip from "../../components/common/UI/Chip/Chip";

describe("a11y: Chip primitive", () => {
  it("static chip renders as a span with no interactive role", () => {
    const { container } = render(<Chip label="Fiction" shape="sharp" />);
    expect(container.firstChild?.nodeName).toBe("SPAN");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("clickable chip renders as a native button", () => {
    render(<Chip label="Draft" shape="rounded" onClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Draft" })).toBeInTheDocument();
  });

  it("toggle chip with active=true exposes aria-pressed=true", () => {
    render(
      <Chip label="Draft" shape="rounded" active={true} onClick={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Draft" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("toggle chip with active=false exposes aria-pressed=false", () => {
    render(
      <Chip label="Final" shape="rounded" active={false} onClick={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Final" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("toggle chip is keyboard activatable", async () => {
    const onClick = vi.fn();
    render(
      <Chip label="Draft" shape="rounded" active={false} onClick={onClick} />,
    );
    const btn = screen.getByRole("button", { name: "Draft" });
    btn.focus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("dismiss button has accessible label", () => {
    render(<Chip label="Tag" shape="sharp" onDismiss={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("tagActive chip renders with chip--tag-active class and no fill style", () => {
    const { container } = render(
      <Chip label="Fiction" shape="sharp" onClick={vi.fn()} tagActive />,
    );
    const el = container.querySelector("button") as HTMLElement;
    expect(el.className).toContain("chip--tag-active");
    expect(el.style.backgroundColor).toBe("");
  });

  it("chip with color and active=true has white text for contrast", () => {
    const { container } = render(
      <Chip
        label="Romance"
        shape="sharp"
        size="sm"
        color="#6b8cae"
        active={true}
        onClick={vi.fn()}
      />,
    );
    const el = container.querySelector("button") as HTMLElement;
    expect(el.style.color).toBe("rgb(255, 255, 255)");
    expect(el.style.backgroundColor).toBe("rgb(107, 140, 174)");
  });
});
