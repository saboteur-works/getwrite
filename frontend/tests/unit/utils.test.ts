import { afterEach, describe, it, expect, vi } from "vitest";
import { slugify } from "../../src/lib/utils";

afterEach(() => {
    vi.unstubAllGlobals();
});
describe("utils.slugify", () => {
    it("should return a slugified string", () => {
        expect(slugify("My Project Name")).toBe("my-project-name");
        expect(slugify("  Leading and trailing spaces  ")).toBe(
            "leading-and-trailing-spaces",
        );
        expect(slugify("Special!@#$%^&*()Characters")).toBe(
            "specialcharacters",
        );
        expect(slugify("Multiple   Spaces")).toBe("multiple-spaces");
        expect(slugify("Already-Slugified")).toBe("already-slugified");
        expect(slugify("")).toBe("project");
        expect(slugify()).toBe("project");
    });
});
