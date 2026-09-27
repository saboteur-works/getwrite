import { describe, it, expect } from "vitest";
import {
  TextResourceSchema,
  ImageResourceSchema,
} from "../../src/lib/models/schemas";

const baseTextResourceFields = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  slug: "some-resource",
  name: "Some Resource",
  type: "text" as const,
  orderIndex: 0,
  createdAt: "2026-08-25T00:00:00.000Z",
};

const baseImageResourceFields = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  slug: "some-image",
  name: "Some Image",
  type: "image" as const,
  orderIndex: 0,
  createdAt: "2026-08-25T00:00:00.000Z",
};

describe("TextResourceSchema wordCountGoal (Feature 61)", () => {
  it("accepts a non-negative integer wordCountGoal", () => {
    const result = TextResourceSchema.safeParse({
      ...baseTextResourceFields,
      wordCountGoal: 5000,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.wordCountGoal).toBe(5000);
    }
  });

  it("accepts its absence entirely", () => {
    const result = TextResourceSchema.safeParse({ ...baseTextResourceFields });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.wordCountGoal).toBeUndefined();
    }
  });

  it("rejects a negative wordCountGoal", () => {
    const result = TextResourceSchema.safeParse({
      ...baseTextResourceFields,
      wordCountGoal: -1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a non-integer wordCountGoal", () => {
    const result = TextResourceSchema.safeParse({
      ...baseTextResourceFields,
      wordCountGoal: 1.5,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a string wordCountGoal", () => {
    const result = TextResourceSchema.safeParse({
      ...baseTextResourceFields,
      wordCountGoal: "5",
    });

    expect(result.success).toBe(false);
  });

  it("strips wordCountGoal from an ImageResourceSchema parse (not a recognized field there)", () => {
    const result = ImageResourceSchema.safeParse({
      ...baseImageResourceFields,
      wordCountGoal: 5000,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(
        Object.prototype.hasOwnProperty.call(result.data, "wordCountGoal"),
      ).toBe(false);
    }
  });
});
