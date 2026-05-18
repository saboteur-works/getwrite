import { describe, it, expect } from "vitest";
import {
    MetadataFieldSchema,
    MetadataGroupSchema,
    MetadataSchemaSchema,
    ResourceRefValueSchema,
    ProjectConfigSchema,
} from "../../src/lib/models/schemas";

describe("ResourceRefValueSchema", () => {
    it("accepts a resolved reference", () => {
        const result = ResourceRefValueSchema.safeParse({
            id: "550e8400-e29b-41d4-a716-446655440000",
            name: "Alice",
        });
        expect(result.success).toBe(true);
    });

    it("accepts a null id (deleted reference)", () => {
        const result = ResourceRefValueSchema.safeParse({ id: null, name: "Bob" });
        expect(result.success).toBe(true);
    });

    it("rejects a missing name", () => {
        const result = ResourceRefValueSchema.safeParse({ id: null });
        expect(result.success).toBe(false);
    });

    it("rejects a numeric id", () => {
        const result = ResourceRefValueSchema.safeParse({ id: 42, name: "Carol" });
        expect(result.success).toBe(false);
    });
});

describe("MetadataFieldSchema", () => {
    it("accepts a minimal text field", () => {
        const result = MetadataFieldSchema.safeParse({
            key: "synopsis",
            label: "Synopsis",
            type: "text",
        });
        expect(result.success).toBe(true);
    });

    it("accepts a locked select field with options", () => {
        const result = MetadataFieldSchema.safeParse({
            key: "status",
            label: "Status",
            type: "select",
            locked: true,
            options: ["Draft", "Complete"],
        });
        expect(result.success).toBe(true);
    });

    it("accepts a resource-ref field with multiple flag", () => {
        const result = MetadataFieldSchema.safeParse({
            key: "pov",
            label: "Point of View",
            type: "resource-ref",
            multiple: false,
        });
        expect(result.success).toBe(true);
    });

    it("accepts a camelCase key (slug enforcement is at the API route layer, not Zod)", () => {
        // Built-in keys like storyDate, storyDuration, storyEndDate are camelCase
        // and must round-trip cleanly. Slug validation is enforced in the POST route.
        const result = MetadataFieldSchema.safeParse({
            key: "storyDate",
            label: "Story Date",
            type: "date",
            locked: true,
        });
        expect(result.success).toBe(true);
    });

    it("accepts a key with spaces (slug enforcement is at the API route layer, not Zod)", () => {
        // The Zod schema accepts any non-empty string; the API route handler
        // rejects non-slug keys for user-created fields before they reach the model.
        const result = MetadataFieldSchema.safeParse({
            key: "my field",
            label: "My Field",
            type: "text",
        });
        expect(result.success).toBe(true);
    });

    it("rejects an empty key", () => {
        const result = MetadataFieldSchema.safeParse({
            key: "",
            label: "Empty",
            type: "text",
        });
        expect(result.success).toBe(false);
    });

    it("rejects an unknown field type", () => {
        const result = MetadataFieldSchema.safeParse({
            key: "custom",
            label: "Custom",
            type: "rich-text",
        });
        expect(result.success).toBe(false);
    });
});

describe("MetadataGroupSchema", () => {
    it("accepts a group with fields", () => {
        const result = MetadataGroupSchema.safeParse({
            id: "default",
            label: "Story",
            fields: [{ key: "synopsis", label: "Synopsis", type: "text" }],
        });
        expect(result.success).toBe(true);
    });

    it("accepts a folder-scoped group", () => {
        const result = MetadataGroupSchema.safeParse({
            id: "characters",
            label: "Character",
            folderId: "550e8400-e29b-41d4-a716-446655440001",
            fields: [],
        });
        expect(result.success).toBe(true);
    });

    it("rejects a group missing id", () => {
        const result = MetadataGroupSchema.safeParse({
            label: "Story",
            fields: [],
        });
        expect(result.success).toBe(false);
    });
});

describe("MetadataSchemaSchema", () => {
    it("accepts a valid schema with multiple groups", () => {
        const result = MetadataSchemaSchema.safeParse({
            groups: [
                {
                    id: "default",
                    label: "Story",
                    fields: [
                        { key: "synopsis", label: "Synopsis", type: "text" },
                        { key: "status", label: "Status", type: "select", options: ["Draft"] },
                    ],
                },
            ],
        });
        expect(result.success).toBe(true);
    });

    it("accepts an empty groups array", () => {
        const result = MetadataSchemaSchema.safeParse({ groups: [] });
        expect(result.success).toBe(true);
    });

    it("rejects when groups is not an array", () => {
        const result = MetadataSchemaSchema.safeParse({ groups: "default" });
        expect(result.success).toBe(false);
    });
});

describe("ProjectConfigSchema.metadataSchema", () => {
    it("accepts a ProjectConfig without metadataSchema", () => {
        const result = ProjectConfigSchema.safeParse({ maxRevisions: 50 });
        expect(result.success).toBe(true);
    });

    it("accepts a ProjectConfig with a valid metadataSchema", () => {
        const result = ProjectConfigSchema.safeParse({
            metadataSchema: {
                groups: [
                    {
                        id: "default",
                        label: "Story",
                        fields: [{ key: "notes", label: "Notes", type: "text", locked: true }],
                    },
                ],
            },
        });
        expect(result.success).toBe(true);
    });

    it("accepts a ProjectConfig with a non-slug key (slug validation is enforced at the API route, not the Zod schema)", () => {
        // MetadataFieldSchema.key accepts any non-empty string so that persisted
        // camelCase built-in keys (storyDate, storyDuration, storyEndDate) round-trip
        // cleanly. Slug-pattern enforcement lives in the POST /api/project/metadata-schema
        // route handler, applied only to user-created fields on write.
        const result = ProjectConfigSchema.safeParse({
            metadataSchema: {
                groups: [
                    {
                        id: "default",
                        label: "Story",
                        fields: [{ key: "storyDate", label: "Story Date", type: "date", locked: true }],
                    },
                ],
            },
        });
        expect(result.success).toBe(true);
    });

    it("rejects a ProjectConfig with an empty-string field key", () => {
        const result = ProjectConfigSchema.safeParse({
            metadataSchema: {
                groups: [
                    {
                        id: "default",
                        label: "Story",
                        fields: [{ key: "", label: "Bad", type: "text" }],
                    },
                ],
            },
        });
        expect(result.success).toBe(false);
    });
});
