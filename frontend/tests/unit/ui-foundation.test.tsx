import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { cn } from "../../components/common/UI/utils";
import Button from "../../components/common/UI/Button/Button";

describe("UI foundation (Task 3 smoke)", () => {
  describe("cn() helper", () => {
    it("merges class strings", () => {
      expect(cn("a", "b")).toBe("a b");
    });

    it("filters falsy values", () => {
      expect(cn("a", false, undefined, null, "b")).toBe("a b");
    });

    it("de-duplicates conflicting Tailwind utilities (last wins)", () => {
      // tailwind-merge should resolve `px-2 px-4` → `px-4`
      expect(cn("px-2", "px-4")).toBe("px-4");
    });

    it("preserves non-conflicting Tailwind utilities", () => {
      expect(cn("text-gw-primary", "bg-gw-chrome2")).toBe(
        "text-gw-primary bg-gw-chrome2",
      );
    });
  });

  describe("Button (canonical primitive, Task 4)", () => {
    it("renders with outline variant including gw-* tokens", () => {
      render(<Button>confirm</Button>);
      const btn = screen.getByRole("button", { name: "confirm" });
      expect(btn.className).toContain("border-gw-primary");
      expect(btn.className).toContain("text-gw-primary");
      expect(btn.className).toContain("px-4");
      expect(btn.className).toContain("py-2");
    });

    it("renders secondary variant with gw-* tokens", () => {
      render(<Button variant="secondary">cancel</Button>);
      const btn = screen.getByRole("button", { name: "cancel" });
      expect(btn.className).toContain("border-gw-border");
      expect(btn.className).toContain("text-gw-secondary");
    });

    it("renders sm size variant", () => {
      render(
        <Button variant="secondary" size="sm">
          cancel
        </Button>,
      );
      const btn = screen.getByRole("button", { name: "cancel" });
      expect(btn.className).toContain("px-3");
      expect(btn.className).toContain("py-2");
    });

    it("allows caller className to override conflicting utilities", () => {
      render(<Button className="px-8">override</Button>);
      const btn = screen.getByRole("button", { name: "override" });
      // tailwind-merge: caller's px-8 wins over variant's px-4
      expect(btn.className).toContain("px-8");
      expect(btn.className).not.toContain("px-4");
    });

    it("defaults type to 'button' (not 'submit')", () => {
      render(<Button>safe</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("type", "button");
    });
  });
});
