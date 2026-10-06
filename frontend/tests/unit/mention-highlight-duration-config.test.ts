import { describe, it, expect } from "vitest";
import { ProjectConfigSchema } from "../../src/lib/models/schemas";

describe("mentionHighlightDurationSeconds (entity-mention-navigation, FR-10)", () => {
  it("accepts the inclusive bounds 1 and 10", () => {
    expect(
      ProjectConfigSchema.parse({ mentionHighlightDurationSeconds: 1 })
        .mentionHighlightDurationSeconds,
    ).toBe(1);
    expect(
      ProjectConfigSchema.parse({ mentionHighlightDurationSeconds: 10 })
        .mentionHighlightDurationSeconds,
    ).toBe(10);
  });

  it("rejects values outside the 1-10 bound", () => {
    expect(
      ProjectConfigSchema.safeParse({ mentionHighlightDurationSeconds: 0 })
        .success,
    ).toBe(false);
    expect(
      ProjectConfigSchema.safeParse({ mentionHighlightDurationSeconds: 11 })
        .success,
    ).toBe(false);
  });

  it("rejects a non-integer value", () => {
    expect(
      ProjectConfigSchema.safeParse({ mentionHighlightDurationSeconds: 2.5 })
        .success,
    ).toBe(false);
  });

  it("is absent when unset", () => {
    const parsed = ProjectConfigSchema.parse({});
    expect("mentionHighlightDurationSeconds" in parsed).toBe(false);
  });
});
