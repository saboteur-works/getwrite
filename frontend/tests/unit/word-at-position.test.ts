/** @vitest-environment jsdom */
/**
 * Unit tests for `findWordRangeAt` (task_0162a56f): the word under a
 * position, used to select the word a touch long-press lands on so Cut and
 * Copy act on it.
 */
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import { findWordRangeAt } from "../../components/Editor/word-at-position";

const editors: Editor[] = [];

function docOf(html: string) {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: baseSchemaExtensions,
    content: html,
  });
  editors.push(editor);
  return editor.state.doc;
}

/** The text a range covers, or null. */
function wordAt(html: string, pos: number): string | null {
  const doc = docOf(html);
  const range = findWordRangeAt(doc, pos);
  return range ? doc.textBetween(range.from, range.to) : null;
}

afterEach(() => {
  while (editors.length > 0) editors.pop()?.destroy();
});

// "<p>Hello wrold and a fine words</p>": paragraph text starts at 1.
// H=1 ... "Hello" 1-6, "wrold" 7-12, "and" 13-16, "a" 17-18, "fine" 19-23.
describe("findWordRangeAt", () => {
  const html = "<p>Hello wrold and a fine words</p>";

  it("finds the word containing the position", () => {
    expect(wordAt(html, 9)).toBe("wrold");
  });

  it("treats a position at either edge of a word as in it", () => {
    expect(wordAt(html, 7)).toBe("wrold");
    expect(wordAt(html, 12)).toBe("wrold");
  });

  it("finds a one-letter word, which the spell checker skips", () => {
    expect(wordAt(html, 17)).toBe("a");
  });

  it("returns null where neither neighbouring character is part of a word", () => {
    // "one" 1-4, space 4-5, "\u2014" 5-6, space 6-7, "two" 7-10.
    expect(wordAt("<p>one \u2014 two</p>", 6)).toBeNull();
  });

  it("keeps an inner apostrophe or hyphen and drops edge punctuation", () => {
    expect(wordAt("<p>(don't)</p>", 4)).toBe("don't");
    expect(wordAt("<p>well-known, yes</p>", 3)).toBe("well-known");
  });

  it("finds a number", () => {
    expect(wordAt("<p>chapter 42 begins</p>", 10)).toBe("42");
  });

  it("stops at an inline node boundary such as a hard break", () => {
    // "ab" 1-3, hard break 3-4, "cd" 4-6.
    expect(wordAt("<p>ab<br>cd</p>", 2)).toBe("ab");
    expect(wordAt("<p>ab<br>cd</p>", 5)).toBe("cd");
  });

  it("spans text split across marks", () => {
    expect(wordAt("<p>wo<strong>rd</strong>s</p>", 2)).toBe("words");
  });

  it("returns null outside inline content", () => {
    expect(wordAt("<p>one</p>", 0)).toBeNull();
  });
});
