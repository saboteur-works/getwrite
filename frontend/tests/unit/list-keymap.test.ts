import { describe, it, expect } from "vitest";
import { extensions } from "../../components/TipTapEditor";

describe("TipTap extension configuration — lists", () => {
    const names = extensions.map((ext) => ext.name);

    it("includes ListKeymap", () => {
        expect(names).toContain("listKeymap");
    });

    it("includes BulletList", () => {
        expect(names).toContain("bulletList");
    });

    it("includes OrderedList", () => {
        expect(names).toContain("orderedList");
    });

    it("includes ListItem", () => {
        expect(names).toContain("listItem");
    });

    it("has no duplicate list extension names", () => {
        for (const name of ["bulletList", "orderedList", "listItem"]) {
            expect(
                names.filter((n) => n === name),
                `expected exactly one registration of "${name}"`,
            ).toHaveLength(1);
        }
    });
});
