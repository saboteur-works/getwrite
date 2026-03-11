import { describe, it, expect } from "vitest";
import { validateProjectType } from "../../src/lib/models/schemas";

describe("project-type validation (T016)", () => {
    it("accepts a minimal valid spec", () => {
        const spec = {
            id: "novel",
            name: "Novel",
            folders: [{ name: "Workspace" }],
        };
        const res = validateProjectType(spec);
        expect(res.success).toBe(true);
        if (res.success && "value" in res && res.value)
            expect(res.value.id).toBe("novel");
    });

    it("rejects a template missing `id`", () => {
        const spec = {
            name: "NoId",
            folders: [{ name: "Workspace" }],
        };
        const res = validateProjectType(spec);
        expect(res.success).toBe(false);
        expect(JSON.stringify(res.errors)).toContain("id");
    });

    it("rejects a template with no `folders` array", () => {
        const spec = {
            id: "no-folders",
            name: "No Folders",
        };
        const res = validateProjectType(spec);
        expect(res.success).toBe(false);
        expect(JSON.stringify(res.errors)).toContain("folders");
    });

    it("rejects a template with empty `folders`", () => {
        const spec = {
            id: "empty-folders",
            name: "Empty Folders",
            folders: [],
        };
        const res = validateProjectType(spec);
        expect(res.success).toBe(false);
        // zod reports a "Too small" array error for empty arrays
        expect(JSON.stringify(res.errors)).toMatch(/Too small|>=1/);
    });

    it("rejects invalid id pattern", () => {
        const spec = {
            id: "Bad ID!",
            name: "Bad",
            folders: [{ name: "Workspace" }],
        };
        const res = validateProjectType(spec);
        expect(res.success).toBe(false);
        expect(JSON.stringify(res.errors)).toContain("pattern");
    });
});
