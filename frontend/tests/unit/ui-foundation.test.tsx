import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { cn } from "../../components/common/UI/utils";
import Button from "../../components/common/UI/Button/Button";
import Input from "../../components/common/UI/Input/Input";

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

    it("keeps a text-gw-* size and a text-gw-* color together", () => {
      // The custom size scale (`text-gw-label` etc.) must be a font-size group.
      // Otherwise tailwind-merge reads it as a text color and drops it when a
      // color class follows.
      expect(cn("text-gw-label", "text-gw-primary")).toBe(
        "text-gw-label text-gw-primary",
      );
      expect(cn("text-gw-primary", "text-gw-label")).toBe(
        "text-gw-primary text-gw-label",
      );
    });

    it("still de-duplicates two text-gw-* sizes (last wins)", () => {
      expect(cn("text-gw-label", "text-gw-nano")).toBe("text-gw-nano");
    });

    it("lets a text-gw-* size override a stock Tailwind size", () => {
      expect(cn("text-sm", "text-gw-label")).toBe("text-gw-label");
    });
  });

  describe("Input", () => {
    it("leaves its font size to the caller", () => {
      // A size baked in here was silently dropped by tailwind-merge for months
      // (see the cn() tests), so every Input inherited its size from an
      // ancestor. Once cn() was fixed the baked-in 11px started applying and
      // shrank every dialog and login field from the inherited 16px. Callers
      // that want a size pass it; everything else keeps inheriting.
      render(<Input aria-label="probe" />);
      const cls = screen.getByLabelText("probe").className;
      expect(cls).not.toMatch(
        /\btext-(xs|sm|base|lg|xl|gw-(hero|display|h1|h2|h3|body|small|editor|label|micro|nano))\b/,
      );
    });

    it("applies a size passed by the caller", () => {
      render(<Input aria-label="probe" className="text-gw-label" />);
      expect(screen.getByLabelText("probe").className).toContain(
        "text-gw-label",
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
