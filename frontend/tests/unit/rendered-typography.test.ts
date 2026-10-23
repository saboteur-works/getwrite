// @vitest-environment jsdom
/**
 * FR-10 (amended 2026-10-23): the toolbar's font controls show the family and
 * size the text at the cursor is rendered in.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import {
  firstFontFamily,
  formatRenderedFontSize,
  readRenderedTypography,
} from "../../components/Editor/MenuBar/rendered-typography";

function editorAt(node: Node): Editor {
  return {
    state: { selection: { from: 1 } },
    view: { domAtPos: () => ({ node, offset: 0 }) },
  } as unknown as Editor;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("firstFontFamily", () => {
  it.each([
    ['"Playfair Display", "IBM Plex Serif", serif', "Playfair Display"],
    ["'Lora', serif", "Lora"],
    ["IBM Plex Sans, sans-serif", "IBM Plex Sans"],
    ["serif", "serif"],
  ])("reads %j as %j", (value, expected) => {
    expect(firstFontFamily(value)).toBe(expected);
  });

  it("returns nothing for an empty value", () => {
    expect(firstFontFamily("")).toBeUndefined();
  });
});

describe("formatRenderedFontSize", () => {
  it.each([
    ["28px", "28"],
    ["18.72px", "18.7"],
    ["15px", "15"],
  ])("formats %j as %j", (value, expected) => {
    expect(formatRenderedFontSize(value)).toBe(expected);
  });

  it.each(["", "1em", "0px", "abcpx"])("returns nothing for %j", (value) => {
    expect(formatRenderedFontSize(value)).toBeUndefined();
  });
});

describe("readRenderedTypography", () => {
  it("reads the computed family and size of the element holding the cursor's text", () => {
    const heading = document.createElement("h2");
    heading.style.fontFamily = '"Playfair Display", "IBM Plex Serif", serif';
    heading.style.fontSize = "28px";
    heading.textContent = "Chapter";
    document.body.append(heading);

    expect(readRenderedTypography(editorAt(heading.firstChild!))).toEqual({
      fontFamily: "Playfair Display",
      fontSize: "28",
    });
  });

  it("reads an explicit mark's span over its block", () => {
    const paragraph = document.createElement("p");
    paragraph.style.fontFamily = "Lora";
    const span = document.createElement("span");
    span.style.fontFamily = "Merriweather";
    span.style.fontSize = "18px";
    span.textContent = "marked";
    paragraph.append(span);
    document.body.append(paragraph);

    expect(readRenderedTypography(editorAt(span.firstChild!))).toEqual({
      fontFamily: "Merriweather",
      fontSize: "18",
    });
  });

  it("returns nothing when the view is not mounted", () => {
    const editor = {
      state: { selection: { from: 1 } },
      get view(): never {
        throw new Error("not mounted");
      },
    } as unknown as Editor;
    expect(readRenderedTypography(editor)).toEqual({});
  });
});
