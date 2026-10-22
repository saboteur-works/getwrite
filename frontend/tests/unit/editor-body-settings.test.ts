import { describe, expect, it } from "vitest";

import {
  buildEditorBodyStyleVariables,
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

// Feature 91 (FR-9): the editor body variable is built through the helper.
describe("buildEditorBodyStyleVariables", () => {
  it("sets the body family variable to the quoted stack", () => {
    expect(
      buildEditorBodyStyleVariables({ fontFamily: "Garamond" })[
        "--gw-body-font-family"
      ],
    ).toBe('"Garamond", "IBM Plex Serif", serif');
  });

  it("applies a stored comma value as stored", () => {
    expect(
      buildEditorBodyStyleVariables({ fontFamily: "Georgia, serif" })[
        "--gw-body-font-family"
      ],
    ).toBe("Georgia, serif");
  });

  it("sets no family declaration for an empty family", () => {
    expect(
      buildEditorBodyStyleVariables({ fontFamily: "" })[
        "--gw-body-font-family"
      ],
    ).toBeUndefined();
    expect(
      buildEditorBodyStyleVariables(undefined)["--gw-body-font-family"],
    ).toBeUndefined();
  });

  it("passes the other body variables through unchanged", () => {
    expect(
      buildEditorBodyStyleVariables({
        fontSize: "18px",
        lineHeight: "1.9",
        paragraphSpacing: "1em",
      }),
    ).toMatchObject({
      "--gw-body-font-size": "18px",
      "--gw-body-line-height": "1.9",
      "--gw-paragraph-spacing": "1em",
    });
  });
});
