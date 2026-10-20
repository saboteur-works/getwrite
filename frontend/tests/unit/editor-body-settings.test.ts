import { describe, expect, it } from "vitest";

import {
  getLineHeightError,
  sanitizeEditorBody,
} from "../../src/lib/editor-body-settings";

const MESSAGE = "Line height must be a number of at least 1.8.";

describe("getLineHeightError (project line height floor)", () => {
  it.each([undefined, "", "   ", "1.8", "2", "3.5", " 2.2 "])(
    "accepts %j",
    (value) => {
      expect(getLineHeightError(value)).toBeUndefined();
    },
  );

  it.each(["1.7", "1", "0.5", "normal", "150%", "1.8em", "28px", "abc", "-2"])(
    "refuses %j with the one message",
    (value) => {
      expect(getLineHeightError(value)).toBe(MESSAGE);
    },
  );
});

describe("sanitizeEditorBody", () => {
  it("does not refuse or rewrite a stored line height below 1.8", () => {
    expect(sanitizeEditorBody({ lineHeight: "1.5" })).toEqual({
      lineHeight: "1.5",
    });
  });
});
