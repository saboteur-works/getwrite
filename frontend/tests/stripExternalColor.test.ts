import { describe, expect, it } from "vitest";
import { stripExternalColor } from "../components/Editor/Extensions/StripExternalPasteColor";

describe("stripExternalColor", () => {
  it("removes color from inline style on external HTML", () => {
    const input = `<span style="color: red">hello</span>`;
    const result = stripExternalColor(input);
    expect(result).not.toContain("color");
    expect(result).toContain("hello");
  });

  it("preserves color when data-pm-slice is present", () => {
    const input = `<meta data-pm-slice="1 1 []"><span style="color: red">hello</span>`;
    const result = stripExternalColor(input);
    expect(result).toContain("color");
  });

  it("removes color but preserves other style properties", () => {
    const input = `<span style="color: blue; font-weight: bold">hello</span>`;
    const result = stripExternalColor(input);
    expect(result).not.toContain("color");
    expect(result).toContain("font-weight");
    expect(result).toContain("bold");
  });

  it("returns plain text with no style attributes unchanged", () => {
    const input = `<p>plain text</p>`;
    const result = stripExternalColor(input);
    expect(result).toContain("plain text");
    expect(result).not.toContain("color");
  });
});
