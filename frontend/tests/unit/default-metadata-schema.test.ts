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

    it("contains synopsis as an unlocked text field", () => {
      const field = getDocumentGroup()!.fields.find(
        (f) => f.key === "synopsis",
      );
      expect(field).toMatchObject({ key: "synopsis", type: "text" });
      expect(field?.locked).not.toBe(true);
    });

    it("contains notes as an unlocked text field", () => {
      const field = getDocumentGroup()!.fields.find((f) => f.key === "notes");
      expect(field).toMatchObject({ key: "notes", type: "text" });
      expect(field?.locked).not.toBe(true);
    });

    it("contains status as a locked select field", () => {
      const field = getDocumentGroup()!.fields.find((f) => f.key === "status");
      expect(field).toMatchObject({
        key: "status",
        type: "select",
        locked: true,
      });
    });

    it("contains pov as an unlocked resource-ref field", () => {
      const field = getDocumentGroup()!.fields.find((f) => f.key === "pov");
      expect(field).toMatchObject({ key: "pov", type: "resource-ref" });
      expect(field?.locked).not.toBe(true);
    });
  });

  describe("Timeline group", () => {
    const getTimelineGroup = () =>
      DEFAULT_METADATA_SCHEMA.groups.find((g) => g.label === "Timeline");

    it("exists", () => {
      expect(getTimelineGroup()).toBeDefined();
    });

    it("keeps the builtin-story-timeline group id", () => {
      expect(getTimelineGroup()!.id).toBe("builtin-story-timeline");
    });

    it("has exactly three fields", () => {
      expect(getTimelineGroup()!.fields).toHaveLength(3);
    });

    it("contains storyDate as an unlocked date field", () => {
      const field = getTimelineGroup()!.fields.find(
        (f) => f.key === "storyDate",
      );
      expect(field).toMatchObject({ key: "storyDate", type: "date" });
      expect(field?.locked).not.toBe(true);
    });

    it("contains storyDuration as an unlocked number field", () => {
      const field = getTimelineGroup()!.fields.find(
        (f) => f.key === "storyDuration",
      );
      expect(field).toMatchObject({ key: "storyDuration", type: "number" });
      expect(field?.locked).not.toBe(true);
    });

    it("contains storyEndDate as an unlocked date field", () => {
      const field = getTimelineGroup()!.fields.find(
        (f) => f.key === "storyEndDate",
      );
      expect(field).toMatchObject({ key: "storyEndDate", type: "date" });
      expect(field?.locked).not.toBe(true);
    });
  });

  it("locks only the status field across both groups", () => {
    const allFields = DEFAULT_METADATA_SCHEMA.groups.flatMap((g) => g.fields);
    expect(allFields).toHaveLength(7);
    const lockedFields = allFields.filter((f) => f.locked === true);
    expect(lockedFields.map((f) => f.key)).toEqual(["status"]);
  });

  it("has no duplicate field keys", () => {
    const keys = DEFAULT_METADATA_SCHEMA.groups.flatMap((g) =>
      g.fields.map((f) => f.key),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
