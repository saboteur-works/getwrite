import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { cn } from "../../components/common/UI/utils";
import SmokeButton from "../../components/common/UI/__smoke__/SmokeButton";

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

    describe("SmokeButton (cva + brand tokens)", () => {
        it("renders with default variant + size classes including gw-* tokens", () => {
            render(<SmokeButton>click</SmokeButton>);
            const btn = screen.getByRole("button", { name: "click" });
            expect(btn.className).toContain("bg-gw-chrome2");
            expect(btn.className).toContain("text-gw-primary");
            expect(btn.className).toContain("border-gw-border");
            expect(btn.className).toContain("px-4");
            expect(btn.className).toContain("py-2");
        });

        it("renders outline variant with gw-* tokens", () => {
            render(<SmokeButton variant="outline">cancel</SmokeButton>);
            const btn = screen.getByRole("button", { name: "cancel" });
            expect(btn.className).toContain("bg-transparent");
            expect(btn.className).toContain("text-gw-secondary");
        });

        it("renders small size variant", () => {
            render(<SmokeButton size="sm">small</SmokeButton>);
            const btn = screen.getByRole("button", { name: "small" });
            expect(btn.className).toContain("px-3");
            expect(btn.className).toContain("py-1.5");
        });

        it("allows caller className to override conflicting utilities", () => {
            render(
                <SmokeButton className="px-8">override</SmokeButton>,
            );
            const btn = screen.getByRole("button", { name: "override" });
            // tailwind-merge: caller's px-8 wins over variant's px-4
            expect(btn.className).toContain("px-8");
            expect(btn.className).not.toContain("px-4");
        });

        it("defaults type to 'button' (not 'submit')", () => {
            render(<SmokeButton>safe</SmokeButton>);
            expect(screen.getByRole("button")).toHaveAttribute("type", "button");
        });
    });
});
