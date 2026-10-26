/**
 * Feature 96, Task 4 (FR-19): response schemas for the user-list API. The
 * persisted list is a bare string array; the paired-device refusal (Task 3)
 * is `{ error, limit }` with `limit` a plain string ("userWordList"), and
 * must never be accepted as a list.
 */
import { describe, expect, it } from "vitest";

import {
  UserWordListErrorResponseSchema,
  UserWordListRefusalSchema,
  UserWordListResponseSchema,
} from "../../src/lib/api/schemas";

const refusal = {
  error: "This action is turned off for paired devices.",
  limit: "userWordList",
};

describe("UserWordListResponseSchema", () => {
  it("parses a valid list and an empty list", () => {
    expect(UserWordListResponseSchema.parse(["Zorblax", "teh"])).toEqual([
      "Zorblax",
      "teh",
    ]);
    expect(UserWordListResponseSchema.parse([])).toEqual([]);
  });

  it("rejects a non-array", () => {
    expect(UserWordListResponseSchema.safeParse({ words: [] }).success).toBe(
      false,
    );
    expect(UserWordListResponseSchema.safeParse("Zorblax").success).toBe(false);
    expect(UserWordListResponseSchema.safeParse(null).success).toBe(false);
  });

  it("rejects a non-string member", () => {
    expect(UserWordListResponseSchema.safeParse(["ok", 3]).success).toBe(false);
    expect(UserWordListResponseSchema.safeParse([null]).success).toBe(false);
  });

  it("does not accept the 403 refusal body as a list", () => {
    expect(UserWordListResponseSchema.safeParse(refusal).success).toBe(false);
  });
});

describe("UserWordListRefusalSchema", () => {
  it("parses the paired refusal with limit as a plain string", () => {
    expect(UserWordListRefusalSchema.parse(refusal)).toEqual(refusal);
  });

  it("rejects a missing field and a wrong type", () => {
    expect(UserWordListRefusalSchema.safeParse({ error: "x" }).success).toBe(
      false,
    );
    expect(
      UserWordListRefusalSchema.safeParse({ limit: "userWordList" }).success,
    ).toBe(false);
    expect(
      UserWordListRefusalSchema.safeParse({ error: "x", limit: 1 }).success,
    ).toBe(false);
  });

  it("does not accept a list", () => {
    expect(UserWordListRefusalSchema.safeParse(["a"]).success).toBe(false);
  });
});

describe("UserWordListErrorResponseSchema", () => {
  it("parses a validation error with a reason and a bare error", () => {
    expect(
      UserWordListErrorResponseSchema.parse({
        error: "bad",
        reason: "too-long",
      }),
    ).toEqual({ error: "bad", reason: "too-long" });
    expect(UserWordListErrorResponseSchema.parse({ error: "bad" })).toEqual({
      error: "bad",
    });
  });

  it("rejects a body with no error and a list", () => {
    expect(UserWordListErrorResponseSchema.safeParse({}).success).toBe(false);
    expect(UserWordListErrorResponseSchema.safeParse(["a"]).success).toBe(
      false,
    );
  });
});
