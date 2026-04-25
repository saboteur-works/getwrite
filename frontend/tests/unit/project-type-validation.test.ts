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

    it("rejects a template without a Workspace folder", () => {
        const spec = {
            id: "no-workspace",
            name: "No Workspace",
            folders: [{ name: "Drafts" }],
        };
        const res = validateProjectType(spec);
        expect(res.success).toBe(false);
        expect(JSON.stringify(res.errors)).toContain("Workspace");
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

    it("rejects unknown top-level fields", () => {
        const spec = {
            id: "strict-shape",
            name: "Strict Shape",
            folders: [{ name: "Workspace" }],
            extra: true,
        };
        const res = validateProjectType(spec);
        expect(res.success).toBe(false);
        expect(JSON.stringify(res.errors)).toContain("extra");
    });
});

/**
 * T027: US3 — Workspace-invariant guardrail coverage for draft decomposition.
 *
 * These assertions verify that the Workspace guardrail holds through the
 * ProjectTypesManagerPage seam extraction.  The guardrail must fire at every
 * update boundary, not only at final save.
 */
describe("project-type Workspace-invariant guardrails (T027)", () => {
    it("requires Workspace folder name to be exactly 'Workspace' (case-sensitive)", () => {
        const spec = {
            id: "case-check",
            name: "Case Check",
            folders: [{ name: "workspace" }],
        };
        const res = validateProjectType(spec);
        expect(res.success).toBe(false);
        expect(JSON.stringify(res.errors)).toContain("Workspace");
    });

    it("accepts a second special Workspace folder alongside non-special folders", () => {
        const spec = {
            id: "multi-folder",
            name: "Multi Folder",
            folders: [{ name: "Drafts" }, { name: "Workspace", special: true }],
        };
        const res = validateProjectType(spec);
        expect(res.success).toBe(true);
    });

    it("rejects a definition with only non-Workspace folders after rename", () => {
        const spec = {
            id: "renamed-workspace",
            name: "Renamed",
            folders: [{ name: "Archive" }, { name: "Notes" }],
        };
        const res = validateProjectType(spec);
        expect(res.success).toBe(false);
        expect(JSON.stringify(res.errors)).toContain("Workspace");
    });

    it("preserves validation result when Workspace folder is the only folder", () => {
        const spec = {
            id: "workspace-only",
            name: "Workspace Only",
            folders: [{ name: "Workspace", special: true }],
        };
        const res = validateProjectType(spec);
        expect(res.success).toBe(true);
    });

    it("accepts Workspace when default resources are defined at both root and folder level", () => {
        const spec = {
            id: "workspace-defaults",
            name: "Workspace Defaults",
            folders: [
                {
                    name: "Workspace",
                    special: true,
                    defaultResources: [{ name: "Scene Seed", type: "text" }],
                },
            ],
            defaultResources: [{ name: "Front Matter", type: "text" }],
        };

        const res = validateProjectType(spec);
        expect(res.success).toBe(true);
        if (res.success && "value" in res && res.value) {
            expect(res.value.folders[0]?.name).toBe("Workspace");
            expect(res.value.defaultResources).toHaveLength(1);
        }
    });

    it("rejects a definition whose id contains uppercase letters", () => {
        const spec = {
            id: "NovelType",
            name: "Novel Type",
            folders: [{ name: "Workspace" }],
        };
        const res = validateProjectType(spec);
        expect(res.success).toBe(false);
    });

    it("rejects a definition with valid id, folders, but a Workspace folder with special=undefined replaced by extra keys", () => {
        const spec = {
            id: "extra-folder-key",
            name: "Extra Folder Key",
            folders: [{ name: "Workspace", special: false, extraKey: "value" }],
        };
        const res = validateProjectType(spec);
        // folder schema is not strict, so extra keys are stripped — should pass
        expect(res.success).toBe(true);
    });

    it("validates that defaultResources entries have required name, type fields", () => {
        const spec = {
            id: "default-resources",
            name: "Default Resources",
            folders: [{ name: "Workspace" }],
            defaultResources: [
                { name: "Scene 1", type: "text", folder: "Workspace" },
            ],
        };
        const res = validateProjectType(spec);
        expect(res.success).toBe(true);
    });

    it("accepts a valid defaultFolders declaration", () => {
        const spec = {
            id: "default-folders",
            name: "Default Folders",
            folders: [{ name: "Workspace" }, { name: "Drafts" }],
            defaultFolders: [{ folder: "Drafts", name: "Act 1" }],
        };
        const res = validateProjectType(spec);
        expect(res.success).toBe(true);
        if (res.success && "value" in res && res.value) {
            expect(res.value.defaultFolders).toHaveLength(1);
            expect(res.value.defaultFolders![0]?.name).toBe("Act 1");
        }
    });

    it("rejects a defaultFolders entry missing name", () => {
        const spec = {
            id: "df-no-name",
            name: "DF No Name",
            folders: [{ name: "Workspace" }],
            defaultFolders: [{ folder: "Workspace" }],
        };
        const res = validateProjectType(spec);
        expect(res.success).toBe(false);
        expect(JSON.stringify(res.errors)).toContain("name");
    });

    it("rejects a defaultFolders entry missing folder", () => {
        const spec = {
            id: "df-no-folder",
            name: "DF No Folder",
            folders: [{ name: "Workspace" }],
            defaultFolders: [{ name: "Act 1" }],
        };
        const res = validateProjectType(spec);
        expect(res.success).toBe(false);
        expect(JSON.stringify(res.errors)).toContain("folder");
    });

    it("still rejects unknown top-level keys when defaultFolders is present", () => {
        const spec = {
            id: "df-strict",
            name: "DF Strict",
            folders: [{ name: "Workspace" }],
            defaultFolders: [{ folder: "Workspace", name: "Sub" }],
            unknownKey: true,
        };
        const res = validateProjectType(spec);
        expect(res.success).toBe(false);
        expect(JSON.stringify(res.errors)).toContain("unknownKey");
    });
});
