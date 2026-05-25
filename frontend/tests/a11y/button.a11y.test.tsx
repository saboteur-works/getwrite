import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Button from "../../components/common/UI/Button/Button";

describe("a11y: Button primitive", () => {
  it("renders as a native button with type=button by default", () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("type", "button");
  });

  it("accepts type=submit for form submission contexts", () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });

  it("disabled button is not clickable", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Disabled" });
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("outline variant renders with primary border token class", () => {
    render(<Button variant="outline">Confirm</Button>);
    const btn = screen.getByRole("button", { name: "Confirm" });
    expect(btn.className).toContain("border-gw-primary");
    expect(btn.className).toContain("text-gw-primary");
  });

  it("secondary variant renders with border token class", () => {
    render(<Button variant="secondary">Cancel</Button>);
    const btn = screen.getByRole("button", { name: "Cancel" });
    expect(btn.className).toContain("border-gw-border");
    expect(btn.className).toContain("text-gw-secondary");
  });

  it("default variant renders with elevated chrome background", () => {
    render(<Button variant="default">Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn.className).toContain("bg-gw-chrome2");
    expect(btn.className).toContain("text-gw-primary");
  });

  it("destructive variant renders with red border token class", () => {
    render(<Button variant="destructive">Delete</Button>);
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn.className).toContain("border-gw-red-border");
    expect(btn.className).toContain("text-gw-red");
  });

  it("ghost variant has no border, renders with secondary text token", () => {
    render(
      <Button variant="ghost" aria-label="Close">
        ×
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Close" });
    expect(btn.className).toContain("text-gw-secondary");
    expect(btn.className).not.toContain("border-gw-border");
    expect(btn.className).not.toContain("border-gw-primary");
  });

  it("icon variant renders as a square button with border", () => {
    render(
      <Button variant="icon" aria-label="Settings">
        ⚙
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Settings" });
    expect(btn.className).toContain("w-9");
    expect(btn.className).toContain("h-9");
    expect(btn.className).toContain("border-gw-border");
  });

  it("xs size applies smaller padding and text", () => {
    render(<Button size="xs">Action</Button>);
    const btn = screen.getByRole("button", { name: "Action" });
    expect(btn.className).toContain("px-2.5");
    expect(btn.className).toContain("text-[9px]");
  });

  it("sm size applies small padding", () => {
    render(
      <Button variant="secondary" size="sm">
        Cancel
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Cancel" });
    expect(btn.className).toContain("px-3");
    expect(btn.className).toContain("py-2");
  });

  it("caller className is merged and wins over variant padding", () => {
    render(<Button className="px-10">Wide</Button>);
    const btn = screen.getByRole("button", { name: "Wide" });
    expect(btn.className).toContain("px-10");
    expect(btn.className).not.toContain("px-4");
  });

  it("triggers onClick when not disabled", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Click me" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("forwards aria-label to the button element", () => {
    render(
      <Button variant="icon" aria-label="Open menu">
        ☰
      </Button>,
    );
    expect(
      screen.getByRole("button", { name: "Open menu" }),
    ).toBeInTheDocument();
  });
});
