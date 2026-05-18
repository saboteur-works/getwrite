import { describe, it, expect } from "vitest";
import { DEFAULT_METADATA_SCHEMA } from "../../src/lib/models/default-metadata-schema";

describe("DEFAULT_METADATA_SCHEMA", () => {
    it("has exactly two groups", () => {
        expect(DEFAULT_METADATA_SCHEMA.groups).toHaveLength(2);
    });

    describe("Document group", () => {
        const getDocumentGroup = () =>
            DEFAULT_METADATA_SCHEMA.groups.find((g) => g.label === "Document");

        it("exists", () => {
            expect(getDocumentGroup()).toBeDefined();
        });

        it("has exactly four fields", () => {
            expect(getDocumentGroup()!.fields).toHaveLength(4);
        });

        it("contains synopsis as a locked text field", () => {
            const field = getDocumentGroup()!.fields.find((f) => f.key === "synopsis");
            expect(field).toMatchObject({ key: "synopsis", type: "text", locked: true });
        });

        it("contains notes as a locked text field", () => {
            const field = getDocumentGroup()!.fields.find((f) => f.key === "notes");
            expect(field).toMatchObject({ key: "notes", type: "text", locked: true });
        });

        it("contains status as a locked select field", () => {
            const field = getDocumentGroup()!.fields.find((f) => f.key === "status");
            expect(field).toMatchObject({ key: "status", type: "select", locked: true });
        });

        it("contains pov as a locked resource-ref field", () => {
            const field = getDocumentGroup()!.fields.find((f) => f.key === "pov");
            expect(field).toMatchObject({ key: "pov", type: "resource-ref", locked: true });
        });
    });

    describe("Story Timeline group", () => {
        const getTimelineGroup = () =>
            DEFAULT_METADATA_SCHEMA.groups.find((g) => g.label === "Story Timeline");

        it("exists", () => {
            expect(getTimelineGroup()).toBeDefined();
        });

        it("has exactly three fields", () => {
            expect(getTimelineGroup()!.fields).toHaveLength(3);
        });

        it("contains storyDate as a locked date field", () => {
            const field = getTimelineGroup()!.fields.find((f) => f.key === "storyDate");
            expect(field).toMatchObject({ key: "storyDate", type: "date", locked: true });
        });

        it("contains storyDuration as a locked number field", () => {
            const field = getTimelineGroup()!.fields.find((f) => f.key === "storyDuration");
            expect(field).toMatchObject({ key: "storyDuration", type: "number", locked: true });
        });

        it("contains storyEndDate as a locked date field", () => {
            const field = getTimelineGroup()!.fields.find((f) => f.key === "storyEndDate");
            expect(field).toMatchObject({ key: "storyEndDate", type: "date", locked: true });
        });
    });

    it("has all seven fields across both groups locked", () => {
        const allFields = DEFAULT_METADATA_SCHEMA.groups.flatMap((g) => g.fields);
        expect(allFields).toHaveLength(7);
        expect(allFields.every((f) => f.locked === true)).toBe(true);
    });

    it("has no duplicate field keys", () => {
        const keys = DEFAULT_METADATA_SCHEMA.groups.flatMap((g) =>
            g.fields.map((f) => f.key),
        );
        expect(new Set(keys).size).toBe(keys.length);
    });
});
