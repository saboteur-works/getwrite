import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { diffWords } from "../../src/lib/models/word-diff";
import { countWords } from "../../src/lib/word-count";
import {
  plainTextToTiptap,
  tiptapToPlainText,
} from "../../src/lib/tiptap-text";

describe("diffWords", () => {
  it("counts pure addition", () => {
    expect(diffWords("one two", "one two three four")).toEqual({
      added: 2,
      deleted: 0,
      net: 2,
    });
  });
  it("counts pure deletion", () => {
    expect(diffWords("one two three", "one")).toEqual({
      added: 0,
      deleted: 2,
      net: -2,
    });
  });
  it("handles empty before", () => {
    expect(diffWords("", "a b c")).toEqual({ added: 3, deleted: 0, net: 3 });
  });
  it("handles empty after", () => {
    expect(diffWords("a b c", "")).toEqual({ added: 0, deleted: 3, net: -3 });
  });
  it("gives 0/0/0 for identical text", () => {
    expect(diffWords("same words here", "same words here")).toEqual({
      added: 0,
      deleted: 0,
      net: 0,
    });
    expect(diffWords("", "")).toEqual({ added: 0, deleted: 0, net: 0 });
  });
  it("net equals added minus deleted", () => {
    const r = diffWords("a b c d", "a x y z w");
    expect(r.net).toBe(r.added - r.deleted);
  });
  it("word totals agree with countWords via tiptapToPlainText", () => {
    const before = tiptapToPlainText(
      plainTextToTiptap("Hello, world!\n--\nthe end"),
    );
    const after = tiptapToPlainText(
      plainTextToTiptap("Hello there, world!\n--\nthe end now"),
    );
    const r = diffWords(before, after);
    expect(r.net).toBe(countWords(after) - countWords(before));
    // "--" has no word character, so it is not counted (same as countWords)
    expect(diffWords("--", "")).toEqual({ added: 0, deleted: 0, net: 0 });
  });
  it("matches duplicated words by multiplicity", () => {
    expect(diffWords("the cat the", "the cat the the")).toEqual({
      added: 1,
      deleted: 0,
      net: 1,
    });
  });
  it("blind spot: a moved paragraph yields 0/0", () => {
    expect(
      diffWords("alpha beta\n\ngamma delta", "gamma delta\n\nalpha beta"),
    ).toEqual({ added: 0, deleted: 0, net: 0 });
  });
  it("blind spot: a rewrite reusing common words undercounts", () => {
    const before = "the cat sat on the mat";
    const after = "the dog ran on the road";
    // a naive replacement count would be 6 added / 6 deleted
    expect(diffWords(before, after)).toEqual({ added: 3, deleted: 3, net: 0 });
  });
  it("does not import fs", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../../src/lib/models/word-diff.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["'](node:)?fs/);
  });
});
