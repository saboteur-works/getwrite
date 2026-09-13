/**
 * Picker options for choosing a Scrivener project — pure, no Electron runtime.
 */
import { describe, it, expect } from "vitest";
import { scrivenerSourceDialogOptions } from "../../src/scrivener-import/source-dialog";

describe("scrivenerSourceDialogOptions", () => {
  it("selects .scriv packages as files on macOS, where they are bundles", () => {
    const options = scrivenerSourceDialogOptions("darwin");

    expect(options.properties).toEqual(["openFile"]);
    expect(options.filters).toEqual([
      { name: "Scrivener Project", extensions: ["scriv"] },
    ]);
  });

  it.each(["win32", "linux"] as const)(
    "selects .scriv folders as directories on %s",
    (platform) => {
      const options = scrivenerSourceDialogOptions(platform);

      expect(options.properties).toEqual(["openDirectory"]);
      expect(options.filters).toBeUndefined();
    },
  );
});
